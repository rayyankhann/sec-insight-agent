"""
edgar_client.py — All SEC EDGAR and market data API interactions live here.

This module is the single source of truth for external data fetching.
No other file in the project should make HTTP requests to EDGAR or Yahoo Finance.

EDGAR API surfaces used:
  - https://efts.sec.gov/LATEST/search-index — full-text search for filings/companies
  - https://data.sec.gov/submissions/           — structured filing history by CIK
  - https://data.sec.gov/api/xbrl/companyfacts/ — structured XBRL financial data
  - https://www.sec.gov/Archives/edgar/         — raw filing documents

Yahoo Finance (free, no key required):
  - https://query1.finance.yahoo.com/v8/finance/chart/{ticker} — OHLCV price history

EDGAR API reference: https://www.sec.gov/developer
"""

import os
import re
import asyncio
from datetime import datetime
import httpx
from typing import Optional

from models import CompanySearchResult, Filing, StockDataPoint, StockQuoteResponse, FinancialMetric

# EDGAR requires a descriptive User-Agent header on every request.
# Without it, requests may be rejected or rate-limited.
EDGAR_USER_AGENT = "SEC Insight Agent contact@example.com"
EDGAR_HEADERS = {"User-Agent": EDGAR_USER_AGENT}

# Base URLs for EDGAR's API surfaces
EDGAR_EFTS_BASE = "https://efts.sec.gov"
EDGAR_DATA_BASE = "https://data.sec.gov"
EDGAR_ARCHIVES_BASE = "https://www.sec.gov"

# Max characters to return from any single filing document.
# GPT-4o's context window is large, but we limit this to control cost and latency.
FILING_TEXT_LIMIT = 12_000


async def search_company_by_name(company_name: str) -> Optional[CompanySearchResult]:
    """
    Search EDGAR for a public company by name and return its CIK number.

    Strategy:
    1. Download EDGAR's master company tickers JSON (https://www.sec.gov/files/company_tickers.json)
       which lists ~10,000 public companies with CIK, ticker, and official name.
    2. Find the best match by scoring against the query:
       - Exact match on ticker symbol (e.g. "AAPL")
       - Exact match on company name (case-insensitive)
       - Prefix match (query is at the start of the company name)
       - Substring match (query appears anywhere in the name)
    3. Fall back to EDGAR's EFTS full-text search if no match is found in the tickers file.

    Using company_tickers.json is more reliable than full-text search for company
    name → CIK resolution because the EFTS endpoint searches filing *content*,
    which can match unrelated companies (e.g., searching "Apple" matches filings
    that mention Apple as a defendant, supplier, etc.).

    Args:
        company_name: Plain-text company name or ticker, e.g. "Apple", "TSLA", "Microsoft Corp"

    Returns:
        CompanySearchResult if found, None if no match.
    """
    tickers_url = f"{EDGAR_ARCHIVES_BASE}/files/company_tickers.json"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(tickers_url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        tickers_data = response.json()

    query_lower = company_name.strip().lower()
    query_upper = company_name.strip().upper()

    best_match: Optional[dict] = None
    best_score = -1

    for entry in tickers_data.values():
        title: str = entry.get("title", "")
        ticker: str = entry.get("ticker", "")
        title_lower = title.lower()

        score = 0

        # Exact ticker match — highest confidence
        if ticker.upper() == query_upper:
            score = 100

        # Exact company name match
        elif title_lower == query_lower:
            score = 90

        # Company name starts with the query (e.g. "Apple" matches "Apple Inc.")
        elif title_lower.startswith(query_lower):
            score = 70

        # Query is a word at the start of the company name
        elif title_lower.split()[0] == query_lower.split()[0] if title_lower and query_lower else False:
            score = 50

        # Company name contains the query as a word
        elif query_lower in title_lower:
            # Prefer shorter names (more specific match)
            score = max(30 - len(title_lower) // 10, 10)

        if score > best_score:
            best_score = score
            best_match = entry

    if best_match and best_score > 0:
        cik_int = best_match["cik_str"]
        cik_padded = str(cik_int).zfill(10)
        return CompanySearchResult(
            company_name=best_match["title"],
            cik=cik_padded,
            ticker=best_match.get("ticker"),
        )

    # Fallback: use EFTS full-text search
    return await _efts_company_search(company_name)


async def _efts_company_search(company_name: str) -> Optional[CompanySearchResult]:
    """
    Fallback company search using EDGAR's EFTS full-text search endpoint.

    Used when the company is not found in company_tickers.json (e.g., smaller filers,
    recent IPOs, foreign private issuers). Searches 10-K filers for the given name.

    Args:
        company_name: Company name string

    Returns:
        CompanySearchResult if found, None otherwise.
    """
    url = f"{EDGAR_EFTS_BASE}/LATEST/search-index"
    params = {
        "q": f'"{company_name}"',
        "forms": "10-K",
        "dateRange": "custom",
        "startdt": "2020-01-01",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params, headers=EDGAR_HEADERS)
        if response.status_code != 200:
            return None
        data = response.json()

    hits = data.get("hits", {}).get("hits", [])
    if not hits:
        return None

    return _parse_efts_hit(hits[0])


def _parse_efts_hit(hit: dict) -> Optional[CompanySearchResult]:
    """
    Extract company identity from a single EDGAR EFTS search hit.

    EFTS search results include a display_names field with the format:
    "Company Name  (TICKER)  (CIK 0000XXXXXX)"

    Args:
        hit: A single search hit from the EDGAR EFTS response

    Returns:
        CompanySearchResult parsed from the hit, or None if required fields are missing.
    """
    source = hit.get("_source", {})
    ciks = source.get("ciks", [])
    display_names = source.get("display_names", [])

    if not ciks:
        return None

    cik = ciks[0]
    ticker: Optional[str] = None
    company_name = cik  # fallback

    if display_names:
        raw = display_names[0]

        # Extract company name — everything before the first parenthesis
        name_match = re.match(r"^([^(]+)", raw)
        if name_match:
            company_name = name_match.group(1).strip().rstrip(".")

        # Extract ticker — first parenthesized uppercase group
        ticker_match = re.search(r"\(([A-Z]{1,5})\)", raw)
        if ticker_match:
            ticker = ticker_match.group(1)

    return CompanySearchResult(company_name=company_name, cik=cik, ticker=ticker)


async def get_company_filings(
    cik: str, filing_type: str = "10-K", limit: int = 3
) -> list[Filing]:
    """
    Retrieve recent SEC filings for a company by CIK.

    Calls EDGAR's submissions API which returns a company's full filing history
    as JSON. We filter by form type and return the most recent N filings.

    EDGAR stores all submissions at:
    https://data.sec.gov/submissions/CIK{zero-padded-10-digit-cik}.json

    Args:
        cik: CIK string (zero-padded or not, we normalize it)
        filing_type: Form type to filter by — "10-K", "10-Q", or "8-K"
        limit: Maximum number of filings to return (1–10)

    Returns:
        List of Filing objects with date, form type, accession number, and document URL.
    """
    # Normalize CIK: EDGAR submissions API requires exactly 10 zero-padded digits
    cik_padded = cik.strip().zfill(10)
    url = f"{EDGAR_DATA_BASE}/submissions/CIK{cik_padded}.json"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        data = response.json()

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    # primaryDocument is available in EDGAR submissions JSON and points directly
    # to the main filing document (e.g., "tsla-20251231.htm"), avoiding exhibits.
    primary_docs = recent.get("primaryDocument", [""] * len(forms))

    # CIK as integer for constructing archive URLs (EDGAR uses non-padded CIK in paths)
    cik_int = int(cik_padded)

    filings: list[Filing] = []

    for form, date, accession, primary_doc in zip(forms, dates, accessions, primary_docs):
        if form != filing_type:
            continue

        accession_no_dashes = accession.replace("-", "")

        if primary_doc:
            # Use the primaryDocument path directly — this points to the main filing
            # document and skips exhibits, which is what we want to read
            document_url = (
                f"{EDGAR_ARCHIVES_BASE}/Archives/edgar/data/{cik_int}/"
                f"{accession_no_dashes}/{primary_doc}"
            )
        else:
            # Fallback: link to the index page so the document fetcher can
            # navigate to the primary document from there
            document_url = (
                f"{EDGAR_ARCHIVES_BASE}/Archives/edgar/data/{cik_int}/"
                f"{accession_no_dashes}/{accession}-index.htm"
            )

        filings.append(
            Filing(
                form_type=form,
                filed_date=date,
                accession_number=accession,
                document_url=document_url,
            )
        )

        if len(filings) >= limit:
            break

    return filings


_SEC_HOSTS = {"sec.gov", "www.sec.gov", "data.sec.gov", "efts.sec.gov"}


def _is_sec_url(url: str) -> bool:
    """Return True if the URL points to SEC.gov (handled by our httpx fetcher)."""
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname in _SEC_HOSTS
    except Exception:
        return False


async def fetch_url_via_cloudflare(url: str) -> Optional[str]:
    """
    Fetch any public URL via Cloudflare Browser Rendering and return clean Markdown.

    Cloudflare spins up a real headless Chrome instance, renders the full page
    (including JavaScript), and converts the result to Markdown. This works on
    news sites, financial pages, and other sites that block plain httpx requests.

    NOT used for SEC.gov URLs — those work fine with httpx and SEC.gov blocks
    requests from Cloudflare's datacenter IPs.

    Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment.
    Returns None on any failure so callers can fall back gracefully.

    Args:
        url: Any public webpage URL.

    Returns:
        Clean Markdown text of the page, or None on failure.
    """
    if _is_sec_url(url):
        return None  # Use httpx for SEC — Cloudflare IPs are blocked by SEC bot protection

    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    api_token = os.getenv("CLOUDFLARE_API_TOKEN")
    if not account_id or not api_token:
        return None

    cf_url = (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{account_id}/browser-rendering/markdown"
    )
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "url": url,
        "rejectResourceTypes": ["image", "font", "stylesheet"],
        "gotoOptions": {"waitUntil": "networkidle2", "timeout": 45000},
    }

    try:
        async with httpx.AsyncClient(timeout=55.0) as client:
            resp = await client.post(cf_url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        if not data.get("success"):
            return None

        markdown = data.get("result", "")
        return markdown.strip() or None

    except Exception:
        return None


async def fetch_filing_text(document_url: str) -> str:
    """
    Fetch and clean the text content of an SEC filing from its URL.

    Uses our proven httpx + regex-strip pipeline for SEC.gov documents.
    (Cloudflare Browser Rendering is not used here because SEC.gov blocks
    Cloudflare datacenter IPs via bot protection.)

    Args:
        document_url: URL to an SEC filing document or filing index page.

    Returns:
        Clean, truncated plain text of the filing content.
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(document_url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        raw_content = response.text

    # If this is a filing index page, navigate to the primary document
    if "-index.htm" in document_url or document_url.endswith("-index.html"):
        primary_url = _extract_primary_doc_from_index(raw_content, document_url)
        if primary_url:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                doc_response = await client.get(primary_url, headers=EDGAR_HEADERS)
                doc_response.raise_for_status()
                raw_content = doc_response.text

    clean_text = _strip_html(raw_content)

    if len(clean_text) > FILING_TEXT_LIMIT:
        clean_text = clean_text[:FILING_TEXT_LIMIT] + "\n\n[Content truncated at 12,000 characters]"

    return clean_text


async def fetch_article_text(url: str) -> str:
    """
    Fetch the full text of an external article or webpage.

    Uses Cloudflare Browser Rendering for JavaScript-heavy pages and sites
    that block plain HTTP requests (news sites, financial blogs, etc.).
    Falls back to a plain httpx GET if Cloudflare is unavailable.

    Args:
        url: Public URL of a news article or financial page.

    Returns:
        Clean text/markdown content, truncated to FILING_TEXT_LIMIT.
    """
    # Try Cloudflare first for external URLs
    cf_text = await fetch_url_via_cloudflare(url)
    if cf_text:
        if len(cf_text) > FILING_TEXT_LIMIT:
            cf_text = cf_text[:FILING_TEXT_LIMIT] + "\n\n[Content truncated]"
        return cf_text

    # Fallback: plain httpx GET + HTML strip
    browser_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers=browser_headers)
            r.raise_for_status()
            text = _strip_html(r.text)
    except Exception as e:
        return f"Could not fetch article: {e}"

    if len(text) > FILING_TEXT_LIMIT:
        text = text[:FILING_TEXT_LIMIT] + "\n\n[Content truncated]"
    return text


def _extract_primary_doc_from_index(index_html: str, base_url: str) -> Optional[str]:
    """
    Parse an EDGAR filing index page to find the URL of the primary document.

    EDGAR index pages list all files in a submission. The primary document is
    typically the first .htm file that is NOT an exhibit (sequence number 1,
    or the first linked .htm file if no sequence metadata is available).

    Args:
        index_html: Raw HTML of the filing index page
        base_url: The index page URL, used to construct absolute URLs

    Returns:
        Absolute URL of the primary filing document, or None.
    """
    # Match links to .htm files inside EDGAR archives
    pattern = r'href="(/Archives/edgar/data/[\w/\-\.]+\.htm)"'
    matches = re.findall(pattern, index_html, re.IGNORECASE)

    # Filter out exhibit indexes and submission manifests
    # The primary document is typically the longest path (most specific)
    non_index_matches = [m for m in matches if "-index" not in m.lower()]

    if non_index_matches:
        return f"https://www.sec.gov{non_index_matches[0]}"

    # Fallback: try any .htm
    if matches:
        return f"https://www.sec.gov{matches[0]}"

    # Last resort: try .txt files (older filings use plain text)
    txt_pattern = r'href="(/Archives/edgar/data/[\w/\-\.]+\.txt)"'
    txt_matches = re.findall(txt_pattern, index_html, re.IGNORECASE)
    if txt_matches:
        return f"https://www.sec.gov{txt_matches[0]}"

    return None


def _strip_html(html_content: str) -> str:
    """
    Remove HTML tags and normalize whitespace from SEC filing content.

    Modern EDGAR filings use iXBRL (inline XBRL) format, which embeds machine-readable
    financial data tags inside the human-readable HTML. This function:

    1. Extracts only the <body> content (skips the <head> which contains XBRL definitions)
    2. Removes hidden divs (XBRL context/unit definitions stored as display:none)
    3. Removes script, style, and XML namespace blocks
    4. Strips all remaining HTML/XBRL tags
    5. Normalizes whitespace

    Args:
        html_content: Raw HTML/iXBRL string from an EDGAR document

    Returns:
        Clean plain text with normalized whitespace.
    """
    # Step 1: Handle iXBRL (inline XBRL) format used by all modern EDGAR filings.
    # iXBRL files embed XBRL data inside the HTML body via an <ix:header> block
    # that can be 100–200KB of machine-readable metadata before the human-readable text.
    # We skip everything up to and including </ix:header> to get to the filing text.
    ix_header_end = html_content.find("</ix:header>")
    if ix_header_end != -1:
        html_content = html_content[ix_header_end + len("</ix:header>"):]

    # Step 2: Also handle the older-style single large display:none div that
    # some filings use to hide XBRL contexts. Remove any top-level display:none div.
    html_content = re.sub(
        r'<div[^>]+style="[^"]*display\s*:\s*none[^"]*"[^>]*>.*?</div>',
        "",
        html_content[:500_000],  # Only scan first 500KB for performance
        count=5,
        flags=re.DOTALL | re.IGNORECASE,
    ) + html_content[500_000:]

    # Step 3: Remove script, style blocks entirely
    html_content = re.sub(
        r"<(script|style)[^>]*>.*?</(script|style)>",
        "",
        html_content,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Step 4: Strip all remaining HTML/XML/XBRL tags
    text = re.sub(r"<[^>]+>", " ", html_content)

    # Step 5: Decode common HTML entities
    entity_map = {
        "&amp;": "&", "&lt;": "<", "&gt;": ">",
        "&nbsp;": " ", "&#160;": " ", "&quot;": '"',
        "&#39;": "'", "&apos;": "'", "&#8217;": "'",
        "&#8220;": '"', "&#8221;": '"', "&#8212;": "—",
        "&#8211;": "–", "&#8226;": "•", "&ldquo;": '"',
        "&rdquo;": '"', "&lsquo;": "'", "&rsquo;": "'",
        "&mdash;": "—", "&ndash;": "–", "&bull;": "•",
    }
    for entity, char in entity_map.items():
        text = text.replace(entity, char)

    # Step 6: Remove lines that are purely XBRL namespace URIs (common artifact)
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # Skip lines that look like XBRL URI references or are very short noise
        if stripped.startswith("http://fasb.org") or stripped.startswith("http://xbrl."):
            continue
        if stripped.startswith("http://www.") and ("xbrl" in stripped or "fasb" in stripped):
            continue
        cleaned_lines.append(line)
    text = "\n".join(cleaned_lines)

    # Step 7: Collapse whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)

    return text.strip()


# ─── Stock Price History (Yahoo Finance) ──────────────────────────────────────

async def fetch_stock_chart(ticker: str, range_: str = "1y") -> list[StockDataPoint]:
    """
    Fetch historical daily closing prices for a stock ticker via Yahoo Finance.

    Yahoo Finance's chart API is free and requires no API key. We use the v8
    chart endpoint which returns OHLCV data as arrays of timestamps and values.

    Args:
        ticker: Stock ticker symbol, e.g. "AAPL", "TSLA"
        range_: Time range — "1y" (1 year), "6mo", "2y", "5y"

    Returns:
        List of StockDataPoint with date and closing price.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker.upper()}"
    params = {
        "range": range_,
        "interval": "1wk",   # Weekly bars keep the payload small
        "includePrePost": "false",
    }
    # Yahoo Finance requires a browser-like User-Agent
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()

    result_data = data.get("chart", {}).get("result", [])
    if not result_data:
        return []

    result = result_data[0]
    timestamps = result.get("timestamp", [])
    closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])

    points: list[StockDataPoint] = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        date_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
        points.append(StockDataPoint(date=date_str, close=round(close, 2)))

    return points


async def fetch_stock_quote(ticker: str) -> StockQuoteResponse:
    """
    Fetch a full stock quote: intraday chart + key stats via the yfinance library.

    yfinance handles Yahoo Finance's cookie/crumb authentication automatically,
    which avoids the 429/401 errors that hit the raw REST endpoints directly.

    Two blocking calls are offloaded to a thread so the FastAPI event loop stays
    non-blocking:
      1. Ticker.info  — fundamentals: price, P/E, EPS, market cap, dividend yield, etc.
      2. Ticker.history(period="1d", interval="5m") — intraday OHLCV DataFrame

    Args:
        ticker: Stock ticker symbol, e.g. "AAPL", "NVDA"

    Returns:
        StockQuoteResponse with live price, key stats, and 1D intraday chart points.
    """
    import yfinance as yf  # imported here to keep module-level imports minimal

    loop = asyncio.get_event_loop()
    t = yf.Ticker(ticker.upper())

    # Run both blocking yfinance calls in a thread pool so we don't block the event loop
    info, hist = await asyncio.gather(
        loop.run_in_executor(None, lambda: t.info),
        loop.run_in_executor(None, lambda: t.history(period="1d", interval="5m")),
    )

    if not info:
        raise ValueError(f"No data returned for ticker '{ticker}'")

    # ── Build intraday chart points ───────────────────────────────────────────
    chart_points: list[StockDataPoint] = []
    if not hist.empty:
        for ts, row in hist.iterrows():
            close = row.get("Close")
            vol = row.get("Volume")
            if close is None or (hasattr(close, "isna") and close.isna()):
                continue
            # Timestamp index is timezone-aware; convert to a naive local string
            dt_str = ts.strftime("%Y-%m-%dT%H:%M")
            chart_points.append(StockDataPoint(
                date=dt_str,
                close=round(float(close), 4),
                volume=float(vol) if vol else None,
            ))

    # ── Extract stats from info dict ──────────────────────────────────────────
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change = (price - prev_close) if (price and prev_close) else None
    change_pct = (change / prev_close * 100) if (change and prev_close) else None

    # Normalise dividend yield: yfinance returns 0.004 for 0.4%
    raw_yield = info.get("dividendYield")
    div_yield = raw_yield if raw_yield else None  # keep as decimal (0.004), frontend formats it

    return StockQuoteResponse(
        ticker=ticker.upper(),
        company_name=info.get("longName") or info.get("shortName"),
        exchange=info.get("exchange") or info.get("fullExchangeName"),
        currency=info.get("currency", "USD"),
        price=price,
        prev_close=prev_close,
        change=round(change, 4) if change else None,
        change_pct=round(change_pct, 4) if change_pct else None,
        post_market_price=info.get("postMarketPrice"),
        post_market_change=info.get("postMarketChange"),
        post_market_change_pct=info.get("postMarketChangePercent"),
        open=info.get("open") or info.get("regularMarketOpen"),
        day_high=info.get("dayHigh") or info.get("regularMarketDayHigh"),
        day_low=info.get("dayLow") or info.get("regularMarketDayLow"),
        volume=info.get("regularMarketVolume") or info.get("volume"),
        market_cap=info.get("marketCap"),
        pe_ratio=info.get("trailingPE"),
        eps=info.get("trailingEps"),
        dividend_yield=div_yield,
        week_52_high=info.get("fiftyTwoWeekHigh"),
        week_52_low=info.get("fiftyTwoWeekLow"),
        chart_data=chart_points,
    )


# ─── EDGAR XBRL Financial Metrics ─────────────────────────────────────────────

# Map of EDGAR XBRL concept names → human-readable labels.
# These are the most universally reported concepts across all public companies.
_FINANCIAL_CONCEPTS: list[tuple[str, str]] = [
    ("Revenues", "Revenue"),
    ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue"),
    ("SalesRevenueNet", "Revenue"),
    ("NetIncomeLoss", "Net Income"),
    ("GrossProfit", "Gross Profit"),
    ("OperatingIncomeLoss", "Operating Income"),
    ("EarningsPerShareBasic", "EPS (Basic)"),
    ("Assets", "Total Assets"),
    ("StockholdersEquity", "Stockholders Equity"),
    ("CashAndCashEquivalentsAtCarryingValue", "Cash & Equivalents"),
    ("LongTermDebt", "Long-Term Debt"),
]


async def fetch_company_financials(cik: str) -> list[FinancialMetric]:
    """
    Fetch key financial metrics from EDGAR's structured XBRL Company Facts API.

    EDGAR's company facts endpoint provides machine-readable financial data for
    every concept a company has ever reported via XBRL inline tagging. This is
    the same data that powers EDGAR's interactive viewer — completely free.

    We extract annual (10-K) values for the most recent two fiscal years to
    enable year-over-year comparisons.

    Args:
        cik: Zero-padded 10-digit CIK string, e.g. "0000320193"

    Returns:
        List of FinancialMetric with label, most-recent value, prior-year value, and period.
    """
    cik_padded = cik.strip().zfill(10)
    url = f"{EDGAR_DATA_BASE}/api/xbrl/companyfacts/CIK{cik_padded}.json"

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        data = response.json()

    us_gaap = data.get("facts", {}).get("us-gaap", {})
    metrics: list[FinancialMetric] = []
    seen_labels: set[str] = set()

    for concept, label in _FINANCIAL_CONCEPTS:
        if label in seen_labels:
            continue

        concept_data = us_gaap.get(concept, {})
        if not concept_data:
            continue

        # Prefer USD units; fall back to shares for per-share metrics
        units = concept_data.get("units", {})
        unit_key = "USD" if "USD" in units else ("USD/shares" if "USD/shares" in units else None)
        if not unit_key:
            continue

        # Filter to annual (10-K) filings only — quarterly values are noisier
        annual_entries = [
            e for e in units[unit_key]
            if e.get("form") == "10-K" and e.get("end") and e.get("val") is not None
        ]
        if not annual_entries:
            continue

        # Sort by end date descending — most recent filing first
        annual_entries.sort(key=lambda e: e["end"], reverse=True)

        latest = annual_entries[0]
        prior = annual_entries[1] if len(annual_entries) > 1 else None

        metrics.append(FinancialMetric(
            label=label,
            value=latest["val"],
            prior_value=prior["val"] if prior else None,
            period=latest["end"],
            unit="USD/share" if unit_key == "USD/shares" else "USD",
        ))
        seen_labels.add(label)

    return metrics


async def fetch_filing_timeline(cik: str, limit_per_type: int = 8) -> list[dict]:
    """
    Fetch recent filings of all major types (10-K, 10-Q, 8-K) for the timeline view.

    Returns a merged, date-sorted list of filings across form types so the
    frontend can render a chronological activity timeline.

    Args:
        cik: Company CIK string
        limit_per_type: How many filings to fetch per form type

    Returns:
        List of filing dicts sorted by filed_date descending.
    """
    cik_padded = cik.strip().zfill(10)
    cik_int = int(cik_padded)

    url = f"{EDGAR_DATA_BASE}/submissions/CIK{cik_padded}.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=EDGAR_HEADERS)
        response.raise_for_status()
        data = response.json()

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [""] * len(forms))

    target_types = {"10-K", "10-Q", "8-K"}
    counts: dict[str, int] = {"10-K": 0, "10-Q": 0, "8-K": 0}
    timeline: list[dict] = []

    for form, date, accession, primary_doc in zip(forms, dates, accessions, primary_docs):
        if form not in target_types:
            continue
        if counts[form] >= limit_per_type:
            continue

        accession_no_dashes = accession.replace("-", "")
        if primary_doc:
            doc_url = f"{EDGAR_ARCHIVES_BASE}/Archives/edgar/data/{cik_int}/{accession_no_dashes}/{primary_doc}"
        else:
            doc_url = f"{EDGAR_ARCHIVES_BASE}/Archives/edgar/data/{cik_int}/{accession_no_dashes}/{accession}-index.htm"

        timeline.append({
            "form_type": form,
            "filed_date": date,
            "accession_number": accession,
            "document_url": doc_url,
        })
        counts[form] += 1

    # Sort by date descending for the timeline view
    timeline.sort(key=lambda x: x["filed_date"], reverse=True)
    return timeline


# ─── Economic Calendar ────────────────────────────────────────────────────────

# Keywords that classify an event as high or medium impact.
# Checked case-insensitively against the event name.
_HIGH_IMPACT_KEYWORDS = [
    "interest rate decision", "monetary policy statement", "rate decision",
    "nonfarm payroll", "non-farm payroll", "nfp",
    "consumer price index", " cpi",
    " gdp ", "gdp ", "gross domestic product", "gdp annualized", "gdp growth",
    "unemployment rate",
    "pce price", "core pce", "personal consumption expenditure",
    "fomc", "federal open market",
    "fed rate", "fed chair", "powell speaks",
    "ecb rate", "ecb interest", "ecb press", "ecb monetary",
    "boe rate", "bank of england", "mpc rate",
    "boj rate", "bank of japan", "boj policy",
    "rba rate", "bank of canada", "boc rate",
    "central bank rate",
]

_MEDIUM_IMPACT_KEYWORDS = [
    "producer price", " ppi",
    "purchasing managers", " pmi",
    " ism ", "ism manufacturing", "ism services",
    "consumer confidence", "consumer sentiment",
    "jobless claims", "initial claims", "unemployment claims",
    "housing starts", "building permits", "existing home sales", "new home sales",
    "durable goods",
    "trade balance",
    "industrial production",
    "retail sales",
    "average hourly earnings", "average cash earnings", "average weekly earnings",
    "core inflation", "inflation rate",
    "employment change", "employment situation",
    "manufacturing output", "manufacturing pmi",
    "services pmi", "composite pmi",
    "import price", "export price",
    "business confidence", "business climate",
    "leading indicator", "leading index",
]


def _classify_impact(event_name: str) -> str:
    """Return 'high', 'medium', or 'low' based on the event name."""
    name_lower = f" {event_name.lower()} "
    for kw in _HIGH_IMPACT_KEYWORDS:
        if kw in name_lower:
            return "high"
    for kw in _MEDIUM_IMPACT_KEYWORDS:
        if kw in name_lower:
            return "medium"
    return "low"


async def fetch_economic_calendar(date_from: str, date_to: str) -> list[dict]:
    """
    Fetch economic calendar events for a date range from Nasdaq's public API.

    Nasdaq's economic events endpoint is completely free and requires no API key.
    We make one request per calendar day (in parallel) and merge results.

    Args:
        date_from: ISO date string "YYYY-MM-DD" (inclusive)
        date_to:   ISO date string "YYYY-MM-DD" (inclusive)

    Returns:
        List of event dicts sorted by date + time, each with:
        date, time_gmt, country, event, actual, forecast, previous, impact, description
    """
    from datetime import date as dt_date, timedelta

    nasdaq_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.nasdaq.com/",
    }

    # Build list of dates in range
    start = dt_date.fromisoformat(date_from)
    end = dt_date.fromisoformat(date_to)
    dates = []
    current = start
    while current <= end:
        # Skip weekends (Nasdaq only has weekday data)
        if current.weekday() < 5:
            dates.append(current.isoformat())
        current += timedelta(days=1)

    async def fetch_day(date_str: str) -> list[dict]:
        url = f"https://api.nasdaq.com/api/calendar/economicevents?date={date_str}"
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                r = await client.get(url, headers=nasdaq_headers)
                if r.status_code != 200:
                    return []
                data = r.json()
                rows = data.get("data", {}).get("rows") or []
                events = []
                for row in rows:
                    name = (row.get("eventName") or "").strip()
                    if not name or name == "&nbsp;":
                        continue
                    actual_raw = (row.get("actual") or "").replace("&nbsp;", "").strip()
                    events.append({
                        "date": date_str,
                        "time_gmt": (row.get("gmt") or "").strip(),
                        "country": (row.get("country") or "").strip(),
                        "event": name,
                        "actual":   actual_raw or None,
                        "forecast": (row.get("consensus") or "").replace("&nbsp;", "").strip() or None,
                        "previous": (row.get("previous") or "").replace("&nbsp;", "").strip() or None,
                        "impact":   _classify_impact(name),
                        "description": (row.get("description") or "").replace("&lt;BR/&gt;", " ").strip() or None,
                    })
                return events
        except Exception:
            return []

    day_results = await asyncio.gather(*[fetch_day(d) for d in dates])
    all_events = [e for day in day_results for e in day]

    # Sort by date then GMT time
    all_events.sort(key=lambda x: (x["date"], x["time_gmt"] or "99:99"))
    return all_events


# ─── Company News ──────────────────────────────────────────────────────────────

async def fetch_company_news(ticker: str) -> list[dict]:
    """
    Fetch recent news headlines for a company via yfinance.

    yfinance wraps Yahoo Finance's news API. The item structure changed in
    v0.2 — content is nested under a 'content' key. We handle both formats.

    Args:
        ticker: Stock ticker symbol, e.g. "AAPL"

    Returns:
        List of dicts with keys: title, publisher, link, published (ISO string).
    """
    import yfinance as yf

    loop = asyncio.get_event_loop()
    t = yf.Ticker(ticker.upper())
    raw_news = await loop.run_in_executor(None, lambda: t.news)

    results = []
    for item in (raw_news or [])[:12]:
        content = item.get("content", {})
        if content and isinstance(content, dict):
            title = content.get("title", "")
            publisher = (content.get("provider") or {}).get("displayName", "")
            canonical = content.get("canonicalUrl") or {}
            link = canonical.get("url", "") if isinstance(canonical, dict) else ""
            pub_date = content.get("pubDate", "")
        else:
            title = item.get("title", "")
            publisher = item.get("publisher", "")
            link = item.get("link", "")
            pt = item.get("providerPublishTime")
            pub_date = datetime.utcfromtimestamp(pt).strftime("%Y-%m-%dT%H:%M:%SZ") if pt else ""

        if title:
            results.append({"title": title, "publisher": publisher, "link": link, "published": pub_date})

    return results[:10]


# ─── Insider Trades (Form 4) ───────────────────────────────────────────────────

async def fetch_insider_trades(cik: str) -> list[dict]:
    """
    Fetch recent Form 4 insider transactions directly from EDGAR.

    Process:
      1. GET /submissions/CIK{cik}.json  — company filing list (one request)
      2. Filter to the 6 most recent Form 4 filings
      3. Concurrently fetch & parse each Form 4 XML to extract transactions
         (nonDerivativeTransaction — covers open-market buys and sells)

    Returns list of dicts: {name, title, date, type, shares, price, value}
    sorted newest-first.
    """
    from xml.etree import ElementTree as ET

    padded = cik.zfill(10)
    numeric_cik = str(int(cik))  # strips leading zeros for archive URLs

    sec_headers = {
        "User-Agent": "SEC Insight Agent research@secinsight.com",
        "Accept": "application/json, text/xml, */*",
    }

    # 1. Fetch company submissions to get Form 4 filing list
    submissions_url = f"https://data.sec.gov/submissions/CIK{padded}.json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(submissions_url, headers=sec_headers)
        resp.raise_for_status()
        data = resp.json()

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])

    # Collect the 6 most recent Form 4 filings
    form4s = []
    for i, f in enumerate(forms):
        if f == "4" and len(form4s) < 6:
            form4s.append({
                "date": dates[i] if i < len(dates) else "",
                "accession": accessions[i].replace("-", "") if i < len(accessions) else "",
                "doc": primary_docs[i] if i < len(primary_docs) else "",
            })

    if not form4s:
        return []

    # 2. Parse each Form 4 XML concurrently
    async def parse_form4(filing: dict) -> list[dict]:
        if not filing["doc"] or not filing["accession"]:
            return []
        url = (
            f"https://www.sec.gov/Archives/edgar/data/"
            f"{numeric_cik}/{filing['accession']}/{filing['doc']}"
        )
        try:
            async with httpx.AsyncClient(timeout=8.0) as c:
                r = await c.get(url, headers=sec_headers)
                if r.status_code != 200:
                    return []
                root = ET.fromstring(r.text)
        except Exception:
            return []

        # Owner name + title
        owner_name = ""
        owner_title = ""
        for tag in ("rptOwnerName", "reportingOwnerName"):
            el = root.find(f".//{tag}")
            if el is not None and el.text:
                owner_name = el.text.strip().title()
                break
        for tag in ("officerTitle", "reporterTitle"):
            el = root.find(f".//{tag}")
            if el is not None and el.text:
                owner_title = el.text.strip().title()
                break

        trades = []
        for txn in root.iter("nonDerivativeTransaction"):
            try:
                shares_el = txn.find(".//transactionShares/value")
                price_el  = txn.find(".//transactionPricePerShare/value")
                code_el   = txn.find(".//transactionAcquiredDisposedCode/value")
                date_el   = txn.find(".//transactionDate/value")

                shares = float(shares_el.text) if shares_el is not None and shares_el.text else None
                price  = float(price_el.text)  if price_el  is not None and price_el.text  else None
                code   = code_el.text.strip()  if code_el   is not None and code_el.text   else None
                txn_date = date_el.text.strip() if date_el  is not None and date_el.text   else filing["date"]

                if shares is not None and code in ("A", "D"):
                    trades.append({
                        "name":  owner_name or "Unknown",
                        "title": owner_title or "Insider",
                        "date":  txn_date,
                        "type":  "Buy" if code == "A" else "Sell",
                        "shares": shares,
                        "price":  price,
                        "value":  round(shares * price) if price else None,
                    })
            except Exception:
                continue
        return trades

    all_results = await asyncio.gather(*[parse_form4(f) for f in form4s])
    merged = [t for batch in all_results for t in batch]
    merged.sort(key=lambda x: x["date"], reverse=True)
    return merged[:20]


# ---------------------------------------------------------------------------
# Market Overview — Major Indices via yfinance
# ---------------------------------------------------------------------------

async def fetch_market_overview() -> list[dict]:
    """
    Fetch live quotes for major market indices and commodities via yfinance.
    Returns price, change, and change_pct for each instrument.
    Free — no API key required.
    """
    import yfinance as yf
    from concurrent.futures import ThreadPoolExecutor

    instruments = [
        ("^GSPC",  "S&P 500"),
        ("^IXIC",  "NASDAQ"),
        ("^DJI",   "DOW"),
        ("^VIX",   "VIX"),
        ("GC=F",   "Gold"),
        ("CL=F",   "Oil"),
    ]

    def _fetch_all() -> list[dict]:
        results = []
        for symbol, name in instruments:
            try:
                t = yf.Ticker(symbol)
                fi = t.fast_info
                price = fi.last_price
                prev  = fi.previous_close
                if price is None:
                    continue
                chg     = price - prev if prev else 0.0
                chg_pct = (chg / prev * 100) if prev else 0.0
                results.append({
                    "symbol":     symbol,
                    "name":       name,
                    "price":      round(price, 2),
                    "change":     round(chg, 2),
                    "change_pct": round(chg_pct, 2),
                })
            except Exception:
                pass
        return results

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as ex:
        return await loop.run_in_executor(ex, _fetch_all)


# ---------------------------------------------------------------------------
# Fear & Greed Index — CNN (free, no key)
# ---------------------------------------------------------------------------

async def fetch_fear_greed() -> dict:
    """
    Fetch CNN's Fear & Greed Index.
    The endpoint is publicly accessible — no API key required.
    """
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.cnn.com/markets/fear-and-greed",
        "Accept":  "application/json",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, headers=headers)
        r.raise_for_status()
        fg = r.json().get("fear_and_greed", {})
        return {
            "score":            round(fg.get("score", 0)),
            "rating":           fg.get("rating", "neutral").replace("_", " ").title(),
            "previous_close":   round(fg.get("previous_close",   0)),
            "previous_1_week":  round(fg.get("previous_1_week",  0)),
            "previous_1_month": round(fg.get("previous_1_month", 0)),
            "previous_1_year":  round(fg.get("previous_1_year",  0)),
        }


# ---------------------------------------------------------------------------
# Congressional Trading — House & Senate Stock Watcher (free, no key)
# ---------------------------------------------------------------------------

# Simple in-memory cache so we don't re-download the ~10 MB files on every request.
_congress_cache: dict[str, tuple[float, list]] = {}
_CONGRESS_TTL = 3600.0  # 1 hour


async def fetch_congressional_trades(ticker: str) -> list[dict]:
    """
    Fetch recent congressional stock disclosures for a specific ticker.

    Data comes from the community-maintained House & Senate Stock Watcher S3 buckets:
      - https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/
      - https://senate-stock-watcher-data.s3-us-east-2.amazonaws.com/

    Completely free, no API key required.
    Results are cached in memory for 1 hour to avoid re-downloading the large files.
    """
    import time

    ticker_upper = ticker.upper()
    now = time.monotonic()

    sources = [
        (
            "House",
            "https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/all_transactions.json",
        ),
        (
            "Senate",
            "https://senate-stock-watcher-data.s3-us-east-2.amazonaws.com/aggregate/all_transactions.json",
        ),
    ]

    results: list[dict] = []

    async with httpx.AsyncClient(timeout=25.0) as client:
        for chamber, url in sources:
            # Use cache if fresh
            cached = _congress_cache.get(chamber)
            if cached and (now - cached[0]) < _CONGRESS_TTL:
                raw_data = cached[1]
            else:
                try:
                    r = await client.get(
                        url,
                        headers={"User-Agent": "SEC-Insight-Agent/1.0 contact@example.com"},
                    )
                    if r.status_code != 200:
                        continue
                    raw_data = r.json()
                    _congress_cache[chamber] = (now, raw_data)
                except Exception:
                    continue

            for trade in raw_data:
                t = (trade.get("ticker") or "").upper().strip()
                if t != ticker_upper:
                    continue
                member = (
                    trade.get("representative")
                    or trade.get("senator")
                    or "Unknown"
                ).strip()
                results.append({
                    "chamber":          chamber,
                    "member":           member,
                    "party":            (trade.get("party") or "").strip(),
                    "transaction_date": (
                        trade.get("transaction_date")
                        or trade.get("transaction_date_raw")
                        or ""
                    ).strip(),
                    "type": (trade.get("type") or "").strip(),
                    "amount": (trade.get("amount") or "").strip(),
                    "asset_description": (
                        trade.get("asset_description")
                        or trade.get("asset_name")
                        or ""
                    ).strip(),
                })

    results.sort(key=lambda x: x.get("transaction_date") or "", reverse=True)
    return results[:40]
