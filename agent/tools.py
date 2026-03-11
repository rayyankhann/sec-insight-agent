"""
tools.py — LangChain tool definitions that wrap calls to the MCP server.

The agent uses these tools to interact with SEC EDGAR data. Each tool:
- Has a clear name and description so the LLM knows when to use it
- Calls the MCP server (never EDGAR directly)
- Returns structured data the agent can reason over

The MCP server URL is read from the environment so this works in any deployment.
"""

import os
import json
import httpx
from langchain_core.tools import tool

# The MCP server's base URL — defaults to localhost for local development
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8001")

# Shared timeout for all tool HTTP calls — EDGAR can be slow on complex queries
HTTP_TIMEOUT = 30.0


@tool
def search_company(company_name: str) -> str:
    """
    Search for a public company by name and return its SEC EDGAR CIK number.

    Use this tool FIRST whenever a user asks about a specific company.
    The CIK (Central Index Key) is required for all subsequent filing lookups.

    Args:
        company_name: The company's common name, e.g. "Apple", "Tesla", "Microsoft"

    Returns:
        JSON string with company_name, cik, and ticker (if available).
        Returns an error message string if the company is not found.

    Example usage: When user asks "What did Apple say about AI?", call this with "Apple"
    """
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            response = client.get(
                f"{MCP_SERVER_URL}/company/search",
                params={"name": company_name},
            )

        if response.status_code == 404:
            return f"Error: No company found matching '{company_name}'. Try the full official company name."

        response.raise_for_status()
        return json.dumps(response.json(), indent=2)

    except httpx.RequestError as e:
        return f"Error: Could not reach the MCP server at {MCP_SERVER_URL}. Is it running? Details: {str(e)}"
    except httpx.HTTPStatusError as e:
        return f"Error fetching company info: HTTP {e.response.status_code} — {e.response.text}"


@tool
def get_filings(cik: str, filing_type: str = "10-K", limit: int = 3) -> str:
    """
    Retrieve the most recent SEC filings for a company using its CIK number.

    Use this tool AFTER search_company to get a list of available filings.
    Always use the CIK returned by search_company — do not guess CIK values.

    Args:
        cik: The company's EDGAR CIK number (from search_company), e.g. "0000320193"
        filing_type: Type of filing to retrieve — one of "10-K" (annual), "10-Q" (quarterly), "8-K" (current events)
                     Default is "10-K". Use "10-Q" for quarterly data, "8-K" for recent announcements.
        limit: How many filings to return (1-10). Default 3. Use 1 if you only need the latest.

    Returns:
        JSON string with a list of filings including form_type, filed_date, accession_number, and document_url.
        Returns an error message string if no filings are found.

    Example usage: After finding Apple's CIK "0000320193", call get_filings("0000320193", "10-K", 1)
    """
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            response = client.get(
                f"{MCP_SERVER_URL}/company/{cik}/filings",
                params={"type": filing_type, "limit": limit},
            )

        if response.status_code == 404:
            return f"Error: No {filing_type} filings found for CIK {cik}. The company may not have filed this form type recently."

        response.raise_for_status()
        return json.dumps(response.json(), indent=2)

    except httpx.RequestError as e:
        return f"Error: Could not reach the MCP server. Details: {str(e)}"
    except httpx.HTTPStatusError as e:
        return f"Error fetching filings: HTTP {e.response.status_code} — {e.response.text}"


@tool
def get_filing_content(document_url: str) -> str:
    """
    Fetch and return the text content of a specific SEC filing document.

    Use this tool AFTER get_filings to read what an actual filing says.
    Pass the document_url from a filing returned by get_filings.

    The content is cleaned (HTML stripped) and truncated to 12,000 characters.
    This is the primary source of information for answering user questions.

    Args:
        document_url: The full SEC.gov URL to a filing document (from get_filings results)

    Returns:
        Plain text content of the filing (up to 12,000 characters).
        Returns an error message string if the document cannot be fetched.

    Example usage: Pass the document_url from a 10-K filing to read its content and answer questions about risks, financials, etc.
    """
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            response = client.get(
                f"{MCP_SERVER_URL}/filing/document",
                params={"url": document_url},
            )

        response.raise_for_status()
        data = response.json()
        # Return just the content text — the agent doesn't need the metadata wrapper
        return data.get("content", "No content returned from filing document.")

    except httpx.RequestError as e:
        return f"Error: Could not reach the MCP server. Details: {str(e)}"
    except httpx.HTTPStatusError as e:
        return f"Error fetching filing content: HTTP {e.response.status_code} — {e.response.text}"


# Collect all tools in a list for easy registration with the agent
ALL_TOOLS = [search_company, get_filings, get_filing_content]
