"""
agent.py — LangChain agent configuration and execution logic.

This module wires together:
- The OpenAI GPT-4o LLM
- The three SEC tools (search_company, get_filings, get_filing_content)
- The system prompt from prompts.py
- LangChain 1.x's create_agent for the reasoning loop (LangGraph-based)

The agent uses OpenAI's tool-calling API under the hood, which lets GPT-4o
decide which tool to call, with what arguments, and how many times — forming
a multi-step reasoning chain to answer complex financial questions.

NOTE: This module uses LangChain 1.x's new create_agent API (not the legacy
create_openai_tools_agent + AgentExecutor pattern from 0.x).
"""

import os
from typing import Any

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

from tools import ALL_TOOLS
from prompts import SYSTEM_PROMPT


def build_agent():
    """
    Construct and return a LangChain 1.x agent (CompiledStateGraph) configured
    with GPT-4o and the three SEC EDGAR tools.

    In LangChain 1.x, create_agent returns a LangGraph CompiledStateGraph.
    It is invoked with {"messages": [...]} and returns {"messages": [...]}
    where the last message is the agent's final answer.

    Returns:
        CompiledStateGraph: the agent graph, ready to invoke.
    """
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError(
            "OPENAI_API_KEY environment variable is not set. "
            "Copy .env.example to .env and add your key."
        )

    # Initialize GPT-4o with temperature=0 for deterministic, factual responses
    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0,
        api_key=openai_api_key,
    )

    # create_agent wires the LLM + tools into a LangGraph reasoning loop.
    # The system_prompt is injected at the start of every conversation.
    agent = create_agent(
        model=llm,
        tools=ALL_TOOLS,
        system_prompt=SYSTEM_PROMPT,
    )

    return agent


def format_chat_history(history: list[dict[str, str]]) -> list[BaseMessage]:
    """
    Convert raw conversation history from the API request into LangChain message objects.

    The frontend sends history as a list of {"role": "user"|"assistant", "content": "..."} dicts.
    LangChain expects typed message objects (HumanMessage, AIMessage).

    Args:
        history: List of conversation turns from the request body

    Returns:
        List of LangChain BaseMessage objects
    """
    messages: list[BaseMessage] = []
    for turn in history:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    return messages


def extract_tool_calls_from_messages(messages: list[BaseMessage]) -> list[dict[str, str]]:
    """
    Walk the agent's output messages to find tool calls that were made.

    In LangChain 1.x, the agent returns all messages including tool call messages
    and tool response messages. We extract tool call info to produce source citations.

    Args:
        messages: All messages from the agent's final state

    Returns:
        List of source dicts with tool name and description.
    """
    sources = []
    seen_tools: set[str] = set()

    for msg in messages:
        # AIMessage with tool_calls attribute indicates the LLM decided to call a tool
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tool_call in msg.tool_calls:
                tool_name = tool_call.get("name", "")
                tool_args = tool_call.get("args", {})

                # Deduplicate — if the same tool was called multiple times, list once
                key = f"{tool_name}:{str(tool_args)[:50]}"
                if key in seen_tools:
                    continue
                seen_tools.add(key)

                if tool_name == "search_company":
                    sources.append({
                        "tool": "search_company",
                        "description": f"Searched for company: {tool_args.get('company_name', '')}",
                    })
                elif tool_name == "get_filings":
                    sources.append({
                        "tool": "get_filings",
                        "description": f"Retrieved {tool_args.get('filing_type', '10-K')} filings for CIK {tool_args.get('cik', '')}",
                    })
                elif tool_name == "get_filing_content":
                    url = tool_args.get("document_url", "")
                    sources.append({
                        "tool": "get_filing_content",
                        "description": f"Read SEC filing document: {url[:80]}{'...' if len(url) > 80 else ''}",
                    })

    return sources
