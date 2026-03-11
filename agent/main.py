"""
main.py — FastAPI entry point for the SEC Insight Agent backend.

This service receives user questions from the frontend, runs them through
the LangChain agent, and returns AI-generated answers sourced from real
SEC EDGAR filings.

Architecture position:
    Frontend → [THIS SERVER] → MCP Server → SEC EDGAR
                     ↕
                 OpenAI GPT-4o

Run with:
    uvicorn main:app --reload --port 8000
"""

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage

from agent import build_agent, format_chat_history, extract_tool_calls_from_messages

# Load .env file at startup — must run before any env var reads
load_dotenv()


# ─── Request / Response Models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """The request body for POST /chat."""
    message: str
    conversation_history: list[dict[str, str]] = []


class ChatResponse(BaseModel):
    """The response body for POST /chat."""
    response: str
    sources: list[dict[str, str]] = []


# ─── App Lifecycle ─────────────────────────────────────────────────────────────

# The agent is built once at startup and shared across all requests.
# Building it is lightweight (no API calls), but we do it here to catch
# misconfiguration (e.g., missing OPENAI_API_KEY) early at startup.
_agent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the agent graph when the server starts."""
    global _agent
    _agent = build_agent()
    print("✓ SEC Insight Agent is ready")
    yield


app = FastAPI(
    title="SEC Insight Agent API",
    description="AI agent that answers questions using real SEC EDGAR filings",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: allow the React frontend (Vite dev server at port 5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Create React App fallback
        "http://localhost:4173",  # Vite preview
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Confirm the agent server is running and the agent is initialized."""
    if _agent is None:
        raise HTTPException(status_code=503, detail="Agent not yet initialized")
    return {"status": "ok", "agent": "ready"}


@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Main chat endpoint — sends a user message to the LangChain agent and returns the answer.

    The agent will autonomously:
    1. Call search_company to find the company's EDGAR CIK
    2. Call get_filings to retrieve recent SEC filings
    3. Call get_filing_content to read the actual filing text
    4. Synthesize an answer based solely on the filing content

    The conversation_history array enables multi-turn conversations — pass back
    previous messages from the frontend on each request to maintain context.

    Request body:
        {
            "message": "What risks did Tesla mention in their latest 10-K?",
            "conversation_history": []
        }

    Response body:
        {
            "response": "Tesla's 2024 10-K highlights the following key risks...",
            "sources": [{"tool": "get_filing_content", "description": "..."}]
        }
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    if _agent is None:
        raise HTTPException(status_code=503, detail="Agent is not yet ready. Please try again.")

    try:
        # Build full message list: previous history + current user message
        history_messages = format_chat_history(request.conversation_history)
        all_messages = history_messages + [HumanMessage(content=request.message)]

        # Invoke the LangGraph agent
        # In LangChain 1.x, the agent takes {"messages": [...]} and returns
        # {"messages": [...]} where the last message is the final AIMessage
        result: dict[str, Any] = await _agent.ainvoke({"messages": all_messages})

        # Extract the final response from the last message in the output
        output_messages = result.get("messages", [])
        if not output_messages:
            raise ValueError("Agent returned no messages")

        # The last message is the agent's final answer
        final_message = output_messages[-1]
        response_text = (
            final_message.content
            if hasattr(final_message, "content")
            else str(final_message)
        )

        # Extract source citations from the messages that involved tool calls
        sources = extract_tool_calls_from_messages(output_messages)

        return ChatResponse(response=response_text, sources=sources)

    except ValueError as e:
        # Catches configuration errors like missing API key
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Agent error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"The agent encountered an error: {str(e)}. Please try rephrasing your question.",
        )
