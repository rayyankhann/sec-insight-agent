/**
 * NewsCard.jsx — Recent news headlines for a company.
 *
 * Fetches from GET /stock/{ticker}/news (MCP server → Yahoo Finance via yfinance).
 * No API key required, no extra cost.
 *
 * Props:
 *   ticker  {string}  e.g. "AAPL"
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

export default function NewsCard({ ticker }) {
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
        <a
          key={i}
          href={item.link || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-[#0d1424] border border-[#1f2937] rounded-lg px-3 py-2.5 hover:border-blue-700 hover:bg-[#111827] transition-colors group"
        >
          <p className="text-xs text-gray-200 leading-snug group-hover:text-white line-clamp-2 mb-1.5">
            {item.title}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500 truncate">{item.publisher}</span>
            <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(item.published)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
