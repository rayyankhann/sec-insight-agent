"""
main.py — FastAPI entry point for the MCP (Model Context Protocol) server.

This microservice is the ONLY component that communicates with SEC EDGAR.
It wraps EDGAR's APIs into clean, well-typed endpoints that the agent backend consumes.

Architecture position:
    Frontend → Agent Backend → [THIS SERVER] → SEC EDGAR

Run with:
    uvicorn main:app --reload --port 8001
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

from edgar_client import (
    search_company_by_name,
    get_company_filings,
    fetch_filing_text,
    fetch_article_text,
    fetch_stock_chart,
    fetch_stock_quote,
    fetch_company_financials,
    fetch_filing_timeline,
    fetch_company_news,
    fetch_insider_trades,
    fetch_economic_calendar,
    fetch_market_overview,
    fetch_fear_greed,
    fetch_congressional_trades,
    fetch_earnings_calendar,
    fetch_options_flow,
    fetch_institutional_holdings,
)
from models import (
    CompanySearchResult,
    FilingsResponse,
    FilingContentResponse,
    StockChartResponse,
    StockQuoteResponse,
    FinancialsResponse,
    FilingTimelineResponse,
    FilingTimelineItem,
    EconomicEvent,
    EconomicCalendarResponse,
    NewsItem,
    NewsResponse,
    InsiderTrade,
    InsiderTradesResponse,
    MarketIndex,
    MarketOverviewResponse,
    FearGreedResponse,
    CongressionalTrade,
    CongressionalTradesResponse,
    EarningsEvent,
    EarningsCalendarResponse,
    OptionsContract,
    OptionsFlowResponse,
    InstitutionalHolder,
    InstitutionalHoldingsResponse,
    HealthResponse,
    ErrorResponse,
)

app = FastAPI(
    title="SEC EDGAR MCP Server",
    description="Microservice wrapping SEC EDGAR APIs for the SEC Insight Agent",
    version="1.0.0",
)

# In production, set ALLOWED_ORIGINS to the Railway agent backend URL so it can call this service.
import os as _os
_extra_mcp_origins = [
    o.strip() for o in _os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()
]
_mcp_cors_origins = [
    "http://localhost:8000",
    "http://localhost:5173",
    "http://localhost:3000",
] + _extra_mcp_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_mcp_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """
    Health check endpoint — confirms the MCP server is running.
    Used by monitoring systems and by the agent backend on startup.
    """
    return HealthResponse(status="ok")


@app.get(
    "/company/search",
    response_model=CompanySearchResult,
    responses={404: {"model": ErrorResponse}},
    tags=["Company"],
)
async def search_company(
    name: str = Query(..., description="Company name to search for, e.g. 'Apple' or 'Tesla'")
) -> CompanySearchResult:
    """
    Search for a public company by name and return its EDGAR CIK number.

    The CIK (Central Index Key) is EDGAR's unique identifier for every registrant.
    All subsequent filing lookups require the CIK, so this is always the first step.

    Example: GET /company/search?name=Apple
    Returns: { "company_name": "APPLE INC", "cik": "0000320193", "ticker": null }
    """
    result = await search_company_by_name(name)

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No company found matching '{name}'. Try a different name or the official registered name.",
        )

    return result


@app.get(
    "/company/{cik}/filings",
    response_model=FilingsResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Filings"],
)
async def get_filings(
    cik: str,
    type: str = Query(default="10-K", description="Filing type: 10-K, 10-Q, or 8-K"),
    limit: int = Query(default=3, ge=1, le=10, description="Max number of filings to return"),
) -> FilingsResponse:
    """
    Retrieve recent SEC filings for a company by its CIK number.

    Returns filings in reverse-chronological order (newest first).
    Each filing includes the form type, date filed, accession number, and document URL.

    Example: GET /company/0000320193/filings?type=10-K&limit=3
    Returns the 3 most recent 10-K annual reports for Apple.
    """
    try:
        filings = await get_company_filings(cik=cik, filing_type=type, limit=limit)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"EDGAR returned an error fetching filings for CIK {cik}: {e.response.status_code}",
        )

    if not filings:
        raise HTTPException(
            status_code=404,
            detail=f"No {type} filings found for CIK {cik}. The company may not have filed this form type.",
        )

    return FilingsResponse(cik=cik, filings=filings)


@app.get(
    "/filing/document",
    response_model=FilingContentResponse,
    responses={400: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Filings"],
)
async def get_filing_document(
    url: str = Query(..., description="Full URL to the SEC filing document")
) -> FilingContentResponse:
    """
    Fetch, clean, and return the text content of a specific SEC filing document.

    This endpoint:
    1. Downloads the raw HTML/text from EDGAR's archives
    2. If the URL is an index page, navigates to the primary document
    3. Strips all HTML markup and normalizes whitespace
    4. Truncates to 12,000 characters to fit within LLM context limits

    The truncation is intentional — EDGAR filings can be hundreds of pages long,
    and we want the most important content (which appears early in the document).

    Example: GET /filing/document?url=https://www.sec.gov/Archives/edgar/...
    """
    if not url.startswith("https://www.sec.gov") and not url.startswith("https://efts.sec.gov") and not url.startswith("http://www.sec.gov"):
        raise HTTPException(
            status_code=400,
            detail="Document URL must point to sec.gov. External URLs are not allowed.",
        )

    try:
        content = await fetch_filing_text(url)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch filing document from EDGAR: HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Network error fetching filing document: {str(e)}",
        )

    if not content.strip():
        raise HTTPException(
            status_code=502,
            detail="Retrieved filing document was empty after processing. The document may be in an unsupported format.",
        )

    return FilingContentResponse(
        url=url,
        content=content,
        char_count=len(content),
    )


@app.get(
    "/stock/{ticker}/chart",
    response_model=StockChartResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_stock_chart(
    ticker: str,
    range: str = Query(default="1y", description="Time range: 1y, 6mo, 2y, 5y"),
) -> StockChartResponse:
    """
    Fetch historical weekly closing prices for a stock via Yahoo Finance.

    This endpoint proxies Yahoo Finance so the frontend never has to call
    external APIs directly (avoids CORS issues and keeps all data fetching
    server-side). Yahoo Finance is free and requires no API key.

    Example: GET /stock/AAPL/chart?range=1y
    """
    try:
        data = await fetch_stock_chart(ticker=ticker, range_=range)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Yahoo Finance returned an error for ticker '{ticker}': HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Network error fetching price data: {str(e)}",
        )

    if not data:
        raise HTTPException(
            status_code=404,
            detail=f"No price data found for ticker '{ticker}'. Make sure the ticker symbol is correct.",
        )

    # Detect the currency from the first data point (USD for US stocks)
    return StockChartResponse(ticker=ticker.upper(), currency="USD", data=data)


@app.get(
    "/stock/{ticker}/quote",
    response_model=StockQuoteResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_stock_quote(ticker: str) -> StockQuoteResponse:
    """
    Fetch a full real-time stock quote with intraday chart and key stats.

    Makes two parallel requests to Yahoo Finance:
    1. Intraday chart data (1D, 5-min intervals)
    2. Quote data: P/E ratio, EPS, market cap, dividend yield, 52-week range

    Used to power the Perplexity-style stock card in the frontend.

    Example: GET /stock/NVDA/quote
    """
    try:
        quote = await fetch_stock_quote(ticker=ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Yahoo Finance returned an error for '{ticker}': HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Network error fetching quote data: {str(e)}",
        )
    return quote


@app.get(
    "/company/{cik}/financials",
    response_model=FinancialsResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Financials"],
)
async def get_company_financials(cik: str) -> FinancialsResponse:
    """
    Fetch structured annual financial metrics from EDGAR's XBRL Company Facts API.

    Returns key metrics (Revenue, Net Income, EPS, Total Assets, etc.) for the
    two most recent fiscal years, enabling year-over-year comparison display.
    Data comes directly from EDGAR's machine-readable XBRL filings — no LLM needed.

    Example: GET /company/0000320193/financials
    """
    try:
        metrics = await fetch_company_financials(cik=cik)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"EDGAR returned an error fetching financials for CIK {cik}: HTTP {e.response.status_code}",
        )

    if not metrics:
        raise HTTPException(
            status_code=404,
            detail=f"No XBRL financial data found for CIK {cik}.",
        )

    return FinancialsResponse(cik=cik, metrics=metrics)


@app.get(
    "/company/{cik}/timeline",
    response_model=FilingTimelineResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Filings"],
)
async def get_filing_timeline(cik: str) -> FilingTimelineResponse:
    """
    Fetch a combined filing timeline (10-K, 10-Q, 8-K) for a company.

    Used to render the visual filing history in the frontend dashboard.
    Returns up to 8 of each filing type, merged and sorted by date.

    Example: GET /company/0001318605/timeline
    """
    try:
        filings = await fetch_filing_timeline(cik=cik)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"EDGAR error fetching timeline for CIK {cik}: HTTP {e.response.status_code}",
        )

    items = [FilingTimelineItem(**f) for f in filings]
    return FilingTimelineResponse(cik=cik, filings=items)


@app.get(
    "/stock/{ticker}/news",
    response_model=NewsResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_company_news(ticker: str) -> NewsResponse:
    """
    Fetch recent news headlines for a stock ticker via Yahoo Finance (yfinance).

    Returns up to 10 headlines with title, publisher, link, and publish date.
    No API key required — uses the same yfinance library as the quote endpoint.

    Example: GET /stock/AAPL/news
    """
    try:
        items_raw = await fetch_company_news(ticker=ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching news for {ticker}: {str(e)}")

    items = [NewsItem(**item) for item in items_raw]
    return NewsResponse(ticker=ticker.upper(), items=items)


@app.get(
    "/company/{cik}/insiders",
    response_model=InsiderTradesResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Filings"],
)
async def get_insider_trades(cik: str) -> InsiderTradesResponse:
    """
    Fetch recent Form 4 insider transactions from EDGAR.

    Parses the 6 most recent Form 4 XML filings for the company, extracting:
    open-market buys and sells with share count, price, and total value.
    All data comes directly from SEC EDGAR — no external API, completely free.

    Example: GET /company/0000320193/insiders
    """
    try:
        trades_raw = await fetch_insider_trades(cik=cik)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"EDGAR error fetching insider trades for CIK {cik}: HTTP {e.response.status_code}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching insider trades: {str(e)}")

    trades = [InsiderTrade(**t) for t in trades_raw]
    return InsiderTradesResponse(cik=cik, trades=trades)


@app.get(
    "/calendar/economic",
    response_model=EconomicCalendarResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Calendar"],
)
async def get_economic_calendar(
    date_from: str = Query(description="Start date YYYY-MM-DD"),
    date_to: str   = Query(description="End date YYYY-MM-DD"),
) -> EconomicCalendarResponse:
    """
    Fetch economic calendar events for a given date range.

    Data comes from Nasdaq's public economic events API — free, no key required.
    Impact level (high/medium/low) is derived from a curated keyword map.

    Example: GET /calendar/economic?date_from=2026-03-10&date_to=2026-03-14
    """
    try:
        events_raw = await fetch_economic_calendar(date_from=date_from, date_to=date_to)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching economic calendar: {str(e)}")

    events = [EconomicEvent(**e) for e in events_raw]
    return EconomicCalendarResponse(week_start=date_from, week_end=date_to, events=events)


@app.get(
    "/earnings/calendar",
    response_model=EarningsCalendarResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_earnings_calendar(
    tickers: str = Query(default="", description="Comma-separated tickers, or blank for S&P 500 watchlist"),
) -> EarningsCalendarResponse:
    """
    Fetch upcoming earnings dates for major companies or a specific set of tickers.
    Returns events within the next 60 days, sorted by date.
    Free — powered by yfinance, no API key required.

    Example: GET /earnings/calendar?tickers=AAPL,MSFT,NVDA
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()] or None
    try:
        raw = await fetch_earnings_calendar(ticker_list)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching earnings calendar: {str(e)}")
    events = [EarningsEvent(**e) for e in raw]
    return EarningsCalendarResponse(events=events)


@app.get(
    "/stock/{ticker}/options",
    response_model=OptionsFlowResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_options_flow(ticker: str) -> OptionsFlowResponse:
    """
    Fetch top options contracts by open interest across the 4 nearest expirations.
    Includes put/call ratio and total OI breakdown.
    Free — powered by yfinance, no API key required.

    Example: GET /stock/NVDA/options
    """
    try:
        data = await fetch_options_flow(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching options for {ticker}: {str(e)}")
    if not data.get("expirations"):
        raise HTTPException(status_code=404, detail=f"No options data found for {ticker}.")
    calls = [OptionsContract(**c) for c in data.get("calls", [])]
    puts  = [OptionsContract(**p) for p in data.get("puts",  [])]
    return OptionsFlowResponse(
        ticker=data["ticker"],
        expirations=data.get("expirations", []),
        put_call_ratio=data.get("put_call_ratio"),
        total_call_oi=data.get("total_call_oi", 0),
        total_put_oi=data.get("total_put_oi", 0),
        calls=calls,
        puts=puts,
    )


@app.get(
    "/stock/{ticker}/institutions",
    response_model=InstitutionalHoldingsResponse,
    responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_institutional_holdings(ticker: str) -> InstitutionalHoldingsResponse:
    """
    Fetch top institutional (13F) holders from SEC filings via yfinance.
    Includes % held by institutions, insiders, and top individual holders.
    Free — no API key required.

    Example: GET /stock/AAPL/institutions
    """
    try:
        data = await fetch_institutional_holdings(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching institutional holdings for {ticker}: {str(e)}")
    if not data.get("holders"):
        raise HTTPException(status_code=404, detail=f"No institutional holdings data found for {ticker}.")
    holders = [InstitutionalHolder(**h) for h in data.get("holders", [])]
    return InstitutionalHoldingsResponse(
        ticker=data["ticker"],
        pct_institutions=data.get("pct_institutions"),
        pct_insiders=data.get("pct_insiders"),
        institutions_count=data.get("institutions_count"),
        holders=holders,
    )


@app.get(
    "/market/overview",
    response_model=MarketOverviewResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_market_overview() -> MarketOverviewResponse:
    """
    Fetch live quotes for major indices: S&P 500, NASDAQ, DOW, VIX, Gold, Oil.
    Uses yfinance — free, no API key required.
    Polled by the frontend MarketBar every 60 seconds.
    """
    try:
        raw = await fetch_market_overview()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching market overview: {str(e)}")
    indices = [MarketIndex(**item) for item in raw]
    return MarketOverviewResponse(indices=indices)


@app.get(
    "/market/fear-greed",
    response_model=FearGreedResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_fear_greed() -> FearGreedResponse:
    """
    Fetch CNN's Fear & Greed Index score (0–100).
    Free public endpoint — no API key required.
    """
    try:
        data = await fetch_fear_greed()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching Fear & Greed: {str(e)}")
    return FearGreedResponse(**data)


@app.get(
    "/stock/{ticker}/congress",
    response_model=CongressionalTradesResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Market Data"],
)
async def get_congressional_trades(ticker: str) -> CongressionalTradesResponse:
    """
    Fetch recent congressional stock disclosures for a ticker (House + Senate).

    Data from the community House/Senate Stock Watcher S3 buckets — free, no key.
    Results are cached server-side for 1 hour to avoid re-downloading the large files.

    Example: GET /stock/NVDA/congress
    """
    try:
        raw = await fetch_congressional_trades(ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching congressional trades: {str(e)}")
    trades = [CongressionalTrade(**t) for t in raw]
    return CongressionalTradesResponse(ticker=ticker.upper(), trades=trades)


@app.post(
    "/fetch/article",
    response_model=FilingContentResponse,
    responses={502: {"model": ErrorResponse}},
    tags=["Fetch"],
)
async def fetch_external_article(body: dict) -> FilingContentResponse:
    """
    Fetch the full text of an external article or webpage.

    Uses Cloudflare Browser Rendering for JavaScript-heavy/paywalled pages
    and falls back to a plain httpx GET if CF credentials are not set.

    Body: { "url": "https://..." }

    Example use: summarise a news article linked from the News tab.
    """
    url = (body or {}).get("url", "").strip()
    if not url:
        raise HTTPException(status_code=422, detail="'url' field is required in request body")

    try:
        content = await fetch_article_text(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching article: {str(e)}")

    return FilingContentResponse(url=url, content=content, char_count=len(content))
