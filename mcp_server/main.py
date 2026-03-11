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
    fetch_stock_chart,
    fetch_company_financials,
    fetch_filing_timeline,
)
from models import (
    CompanySearchResult,
    FilingsResponse,
    FilingContentResponse,
    StockChartResponse,
    FinancialsResponse,
    FilingTimelineResponse,
    FilingTimelineItem,
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
