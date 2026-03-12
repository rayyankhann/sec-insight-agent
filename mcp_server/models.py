"""
models.py — Pydantic request/response models for the MCP server.

These models define the shape of data flowing in and out of each endpoint.
Using Pydantic ensures automatic validation and clean OpenAPI docs.
"""

from pydantic import BaseModel
from typing import Optional


class CompanySearchResult(BaseModel):
    """Returned by GET /company/search — basic identifying info for a company."""
    company_name: str
    cik: str          # EDGAR's unique company identifier (zero-padded to 10 digits)
    ticker: Optional[str] = None


class Filing(BaseModel):
    """A single SEC filing entry returned by GET /company/{cik}/filings."""
    form_type: str        # e.g. "10-K", "10-Q", "8-K"
    filed_date: str       # ISO date string, e.g. "2024-01-15"
    accession_number: str # EDGAR's unique filing ID, e.g. "0000320193-24-000006"
    document_url: str     # Direct URL to the primary filing document


class FilingsResponse(BaseModel):
    """Wraps a list of filings for a company — returned by GET /company/{cik}/filings."""
    cik: str
    filings: list[Filing]


class FilingContentResponse(BaseModel):
    """Plain-text content of a filing document — returned by GET /filing/document."""
    url: str
    content: str          # Cleaned, truncated text of the filing
    char_count: int       # How many characters were returned (after truncation)


class StockDataPoint(BaseModel):
    """A single price data point for a stock chart."""
    date: str       # ISO datetime or date string
    close: float    # Closing/last price
    volume: Optional[float] = None  # Trading volume for that period


class StockChartResponse(BaseModel):
    """Historical stock price data — returned by GET /stock/{ticker}/chart."""
    ticker: str
    currency: str
    data: list[StockDataPoint]


class StockQuoteResponse(BaseModel):
    """
    Full stock quote with intraday chart and key stats.
    Returned by GET /stock/{ticker}/quote.
    Mirrors the data shown in professional stock widgets.
    """
    ticker: str
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    currency: str = "USD"

    # Current price data
    price: Optional[float] = None
    prev_close: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None

    # After-hours
    post_market_price: Optional[float] = None
    post_market_change: Optional[float] = None
    post_market_change_pct: Optional[float] = None

    # Intraday stats
    open: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    volume: Optional[float] = None

    # Fundamentals
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    eps: Optional[float] = None
    dividend_yield: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None

    # Intraday chart points (5-min intervals for 1D)
    chart_data: list[StockDataPoint] = []


class FinancialMetric(BaseModel):
    """A single financial metric with its most recent value and prior year value."""
    label: str            # Human-readable name, e.g. "Revenue"
    value: Optional[float] = None   # Most recent annual value (in USD)
    prior_value: Optional[float] = None  # Prior year value for YoY comparison
    period: Optional[str] = None    # Fiscal period end date, e.g. "2024-09-28"
    unit: str = "USD"


class FinancialsResponse(BaseModel):
    """Key financial metrics — returned by GET /company/{cik}/financials."""
    cik: str
    company_name: Optional[str] = None
    metrics: list[FinancialMetric]


class FilingTimelineItem(BaseModel):
    """A single entry in a company's filing history for the timeline view."""
    form_type: str
    filed_date: str
    accession_number: str
    document_url: str


class FilingTimelineResponse(BaseModel):
    """Multi-type filing history — returned by GET /company/{cik}/timeline."""
    cik: str
    filings: list[FilingTimelineItem]


class EconomicEvent(BaseModel):
    """A single economic calendar event."""
    date: str                        # ISO date, e.g. "2026-03-12"
    time_gmt: str                    # GMT time string, e.g. "13:30"
    country: str                     # e.g. "United States"
    event: str                       # Event name
    actual: Optional[str] = None     # Reported value (empty string = not yet released)
    forecast: Optional[str] = None   # Consensus estimate
    previous: Optional[str] = None   # Prior period value
    impact: str = "low"              # "high" | "medium" | "low"
    description: Optional[str] = None
    impact_score: int = 1            # 1-10 market-impact score
    affected_assets: list[str] = []  # e.g. ["USD", "US Equities", "Gold"]


class EconomicCalendarResponse(BaseModel):
    """Full week of economic events — returned by GET /calendar/economic."""
    week_start: str                  # ISO date of Monday
    week_end: str                    # ISO date of Friday
    events: list[EconomicEvent] = []


class NewsItem(BaseModel):
    """A single news headline — returned as part of NewsResponse."""
    title: str
    publisher: str = ""
    link: str = ""
    published: str = ""   # ISO datetime string


class NewsResponse(BaseModel):
    """Recent news headlines for a company — returned by GET /stock/{ticker}/news."""
    ticker: str
    items: list[NewsItem] = []


class InsiderTrade(BaseModel):
    """A single Form 4 insider transaction."""
    name: str                         # Reporting owner's name
    title: str = ""                   # Officer title or relationship
    date: str                         # Transaction date, e.g. "2024-08-22"
    type: str                         # "Buy" (Acquired) or "Sell" (Disposed)
    shares: float                     # Number of shares transacted
    price: Optional[float] = None     # Price per share at transaction
    value: Optional[float] = None     # Total dollar value (shares × price)


class InsiderTradesResponse(BaseModel):
    """Recent Form 4 insider transactions — returned by GET /company/{cik}/insiders."""
    cik: str
    trades: list[InsiderTrade] = []


class EarningsEvent(BaseModel):
    """A single upcoming earnings release."""
    ticker: str
    company_name: str = ""
    earnings_date: str
    eps_estimate: Optional[float] = None
    eps_high: Optional[float] = None
    eps_low: Optional[float] = None
    revenue_estimate: Optional[float] = None


class EarningsCalendarResponse(BaseModel):
    """Upcoming earnings events — returned by GET /earnings/calendar."""
    events: list[EarningsEvent] = []


class OptionsContract(BaseModel):
    """A single options contract."""
    type: str                              # "call" or "put"
    strike: float
    expiration: str
    last_price: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None
    implied_volatility: Optional[float] = None
    in_the_money: bool = False


class OptionsFlowResponse(BaseModel):
    """Options chain summary — returned by GET /stock/{ticker}/options."""
    ticker: str
    expirations: list[str] = []
    put_call_ratio: Optional[float] = None
    total_call_oi: int = 0
    total_put_oi: int = 0
    oi_is_volume: bool = False   # True when OI data unavailable, showing volume instead
    calls: list[OptionsContract] = []
    puts: list[OptionsContract] = []


class InstitutionalHolder(BaseModel):
    """A single institutional holder from 13F filings."""
    name: str
    shares: Optional[float] = None
    value: Optional[float] = None
    pct_held: Optional[float] = None
    pct_change: Optional[float] = None
    date_reported: Optional[str] = None


class InstitutionalHoldingsResponse(BaseModel):
    """Institutional 13F holders — returned by GET /stock/{ticker}/institutions."""
    ticker: str
    pct_institutions: Optional[float] = None
    pct_insiders: Optional[float] = None
    institutions_count: Optional[int] = None
    holders: list[InstitutionalHolder] = []


class MarketIndex(BaseModel):
    """A single market index or instrument quote."""
    symbol: str
    name: str
    price: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None


class MarketOverviewResponse(BaseModel):
    """Live quotes for major market indices — returned by GET /market/overview."""
    indices: list[MarketIndex] = []


class FearGreedResponse(BaseModel):
    """CNN Fear & Greed Index — returned by GET /market/fear-greed."""
    score: int
    rating: str
    previous_close: int
    previous_1_week: int
    previous_1_month: int
    previous_1_year: int


class CongressionalTrade(BaseModel):
    """A single congressional stock disclosure."""
    chamber: str                       # "House" or "Senate"
    member: str                        # Representative or Senator name
    party: str = ""                    # "D", "R", "I"
    transaction_date: str              # ISO date
    type: str                          # "purchase", "sale", "sale (partial)", etc.
    amount: str = ""                   # Range string e.g. "$1,001 - $15,000"
    asset_description: str = ""


class CongressionalTradesResponse(BaseModel):
    """Recent congressional trades for a ticker — returned by GET /stock/{ticker}/congress."""
    ticker: str
    trades: list[CongressionalTrade] = []


class HealthResponse(BaseModel):
    """Simple health check response — returned by GET /health."""
    status: str


class ErrorResponse(BaseModel):
    """Standardized error shape used across all endpoints when something goes wrong."""
    error: str
    detail: Optional[str] = None
