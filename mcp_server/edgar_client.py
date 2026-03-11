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

import re
from datetime import datetime
import httpx
from typing import Optional

from models import CompanySearchResult, Filing, StockDataPoint, FinancialMetric

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


async def fetch_filing_text(document_url: str) -> str:
    """
    Fetch and clean the text content of an SEC filing from its URL.

    SEC filings can be HTML, XBRL-wrapped HTML, or plain text. This function:
    1. Downloads the raw content from EDGAR's archives
    2. If it's an index page (ends in -index.htm), finds and fetches the primary document
    3. Strips all HTML tags to get clean readable text
    4. Truncates to FILING_TEXT_LIMIT characters to manage LLM context size

    Args:
        document_url: URL to an SEC filing document or filing index page

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

    # Strip HTML and clean whitespace
    clean_text = _strip_html(raw_content)

    # Truncate to stay within LLM context limits
    if len(clean_text) > FILING_TEXT_LIMIT:
        clean_text = clean_text[:FILING_TEXT_LIMIT] + "\n\n[Content truncated at 12,000 characters]"

    return clean_text


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
