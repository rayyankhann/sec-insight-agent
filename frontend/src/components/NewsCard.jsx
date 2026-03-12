/**
 * NewsCard.jsx — Recent news headlines for a company.
 *
 * Fetches from GET /stock/{ticker}/news (MCP server → Yahoo Finance via yfinance).
 * Each headline has a "Summarize" button that fetches the full article via
 * Cloudflare Browser Rendering and sends it to the agent chat.
 *
 * Props:
 *   ticker           {string}    e.g. "AAPL"
 *   onSummarize      {Function}  called with the article text to send to chat
 */

import { useState, useEffect } from "react";

const MCP_BASE = import.meta.env.VITE_MCP_URL ?? "/mcp";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

function NewsItem({ item, onSummarize }) {
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.link || summarizing) return;

    setSummarizing(true);
    try {
      const r = await fetch(`${MCP_BASE}/fetch/article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.link }),
      });
      const data = await r.json();
      const content = data.content || "";
      if (content && onSummarize) {
        onSummarize(
          `Please summarize this news article about the company:\n\nTitle: ${item.title}\nSource: ${item.publisher}\n\n${content}`
        );
      }
    } catch {
      // Silently fail — user can still open the link manually
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="bg-[#0d1424] border border-[#1f2937] rounded-lg px-3 py-2.5 hover:border-[#374151] transition-colors group">
      {/* Headline — clickable link */}
      <a
        href={item.link || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-1.5"
      >
        <p className="text-xs text-gray-200 leading-snug group-hover:text-white line-clamp-2">
          {item.title}
        </p>
      </a>

      {/* Footer row: publisher · time · summarize button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-gray-500 truncate">{item.publisher}</span>
          <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(item.published)}</span>
        </div>

        {item.link && onSummarize && (
          <button
            onClick={handleSummarize}
            disabled={summarizing}
            className="shrink-0 text-[10px] text-blue-500 hover:text-blue-300 border border-blue-900 hover:border-blue-700 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-wait"
            title="Summarize this article using the AI agent"
          >
            {summarizing ? "…" : "Summarize"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function NewsCard({ ticker, onSummarize }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    fetch(`${MCP_BASE}/stock/${ticker}/news`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setNews(data.items || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [ticker]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#111827] rounded-lg p-3">
            <div className="h-3 bg-white/10 rounded w-3/4 mb-2" />
            <div className="h-2 bg-white/5 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !news.length) {
    return (
      <p className="text-gray-600 text-xs text-center py-6">
        {error ? "Could not load news." : "No recent news found."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {news.map((item, i) => (
        <NewsItem key={i} item={item} onSummarize={onSummarize} />
      ))}
    </div>
  );
}
