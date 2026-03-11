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


class HealthResponse(BaseModel):
    """Simple health check response — returned by GET /health."""
    status: str


class ErrorResponse(BaseModel):
    """Standardized error shape used across all endpoints when something goes wrong."""
    error: str
    detail: Optional[str] = None
