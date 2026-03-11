/**
 * InsiderTrading.jsx — Recent Form 4 insider buy/sell transactions.
 *
 * Fetches from GET /company/{cik}/insiders (MCP server → EDGAR Form 4 XML).
 * Completely free — sourced directly from SEC EDGAR, no API key needed.
 *
 * Props:
 *   cik  {string}  e.g. "0000320193"
 */

import { useState, useEffect } from "react";

const MCP_BASE = import.meta.env.VITE_MCP_URL ?? "/mcp";

function fmtShares(n) {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtValue(n) {
  if (n == null) return "";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function InsiderTrading({ cik }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cik) return;
    setLoading(true);
    setError(null);

    fetch(`${MCP_BASE}/company/${cik}/insiders`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setTrades(data.trades || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [cik]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !trades.length) {
    return (
      <p className="text-gray-600 text-xs text-center py-6">
        {error ? "Could not load insider data." : "No recent Form 4 transactions found."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {trades.map((t, i) => {
        const isBuy = t.type === "Buy";
        return (
          <div
            key={i}
            className="bg-[#0d1424] border border-[#1f2937] rounded-lg px-3 py-2.5"
          >
            {/* Row 1: name + badge + value */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate leading-tight">
                  {t.name}
                </p>
                <p className="text-[10px] text-gray-500 truncate leading-tight">{t.title}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {t.value && (
                  <span className="text-[10px] text-gray-400">{fmtValue(t.value)}</span>
                )}
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    isBuy
                      ? "bg-green-950 text-green-400 border border-green-900"
                      : "bg-red-950 text-red-400 border border-red-900"
                  }`}
                >
                  {t.type}
                </span>
              </div>
            </div>

            {/* Row 2: shares + price + date */}
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>
                {fmtShares(t.shares)} shares
                {t.price ? ` @ $${Number(t.price).toFixed(2)}` : ""}
              </span>
              <span>{fmtDate(t.date)}</span>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-gray-600 text-center pt-1">
        Source: SEC EDGAR Form 4 filings
      </p>
    </div>
  );
}
