/**
 * StockCard.jsx — Perplexity Finance-style stock widget.
 *
 * Shows: company header, live price + change, intraday/range chart with
 * a colour split at prev-close (green above, red below), volume bars,
 * and a 3×3 key-stats grid at the bottom.
 *
 * Props:
 *   ticker       {string}  e.g. "NVDA"
 *   companyName  {string}  e.g. "NVIDIA Corporation"  (optional fallback)
 */

import { useState, useEffect, useRef } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// In production set VITE_MCP_URL to the deployed MCP server URL.
// In dev, the Vite proxy rewrites /mcp/* → http://localhost:8001/*
const MCP_BASE = import.meta.env.VITE_MCP_URL ?? "/mcp";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n, decimals = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtLarge(n) {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n) {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtPct(n) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

// Compact time label for intraday (HH:MM) or date label for longer ranges
function fmtLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  // If it contains 'T' it's intraday — show time only
  if (dateStr.includes("T")) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Ticker initials for avatar
function tickerColor(ticker) {
  const colors = [
    "#16a34a", "#2563eb", "#7c3aed", "#dc2626", "#d97706",
    "#0891b2", "#be185d", "#15803d", "#1d4ed8", "#6d28d9",
  ];
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = ticker.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

// Range buttons config
const RANGES = [
  { label: "1D", range: "1d" },
  { label: "1W", range: "5d" },
  { label: "1M", range: "1mo" },
  { label: "6M", range: "6mo" },
  { label: "1Y", range: "1y" },
];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const price = payload[0]?.value;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{fmtLabel(label)}</p>
      <p className="text-white font-semibold">${fmt(price)}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockCard({ ticker, companyName: propName }) {
  const [quote, setQuote] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRange, setActiveRange] = useState("1D");
  const abortRef = useRef(null);

  // Load the full quote on mount (1D intraday + stats)
  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    fetch(`${MCP_BASE}/stock/${ticker}/quote`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setQuote(data);
        setChartData(data.chart_data || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [ticker]);

  // Fetch a different range from the chart endpoint
  const loadRange = async (rangeLabel, rangeParam) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setActiveRange(rangeLabel);

    if (rangeLabel === "1D") {
      // Re-use the already-fetched quote data
      setChartData(quote?.chart_data || []);
      return;
    }

    try {
      const r = await fetch(
        `${MCP_BASE}/stock/${ticker}/chart?range=${rangeParam}`,
        { signal: abortRef.current.signal }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setChartData(data.data || []);
    } catch (e) {
      if (e.name !== "AbortError") console.error("Range fetch failed:", e);
    }
  };

  // ── Derived chart metrics ──────────────────────────────────────────────────

  const prices = chartData.map((d) => d.close).filter(Boolean);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const prevClose = quote?.prev_close ?? minPrice;

  // Gradient offset: where prev_close sits in the price range (0=top,1=bottom in SVG)
  const gradientOffset =
    maxPrice !== minPrice
      ? (maxPrice - prevClose) / (maxPrice - minPrice)
      : 0.5;

  // Pad the Y axis slightly
  const yPad = (maxPrice - minPrice) * 0.1 || 1;
  const yDomain = [minPrice - yPad, maxPrice + yPad];

  const isUp = (quote?.change ?? 0) >= 0;
  const priceColor = isUp ? "#22c55e" : "#ef4444";

  // Keep only every Nth label to avoid crowding
  const labelInterval = Math.max(1, Math.floor(chartData.length / 6));

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mt-3 rounded-xl bg-[#111111] border border-white/8 p-5 animate-pulse">
        <div className="h-4 w-40 bg-white/10 rounded mb-3" />
        <div className="h-8 w-28 bg-white/10 rounded mb-6" />
        <div className="h-32 bg-white/5 rounded" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="mt-3 rounded-xl bg-[#111111] border border-white/8 p-5 text-gray-500 text-sm">
        Could not load quote for <span className="font-mono">{ticker}</span>.
      </div>
    );
  }

  const displayName = quote.company_name || propName || ticker;

  // Stat grid rows — mirrors the Perplexity layout
  const stats = [
    { label: "Prev Close", value: `$${fmt(quote.prev_close)}` },
    { label: "Market Cap",  value: fmtLarge(quote.market_cap) },
    { label: "Open",        value: `$${fmt(quote.open)}` },
    { label: "P/E Ratio",   value: fmt(quote.pe_ratio) },
    { label: "Day Range",   value: `$${fmt(quote.day_low)} – $${fmt(quote.day_high)}` },
    { label: "Div. Yield",  value: fmtPct(quote.dividend_yield) },
    { label: "52W Range",   value: `$${fmt(quote.week_52_low)} – $${fmt(quote.week_52_high)}` },
    { label: "EPS",         value: quote.eps != null ? `$${fmt(quote.eps)}` : "—" },
    { label: "Volume",      value: fmtVol(quote.volume) },
  ];

  return (
    <div className="mt-3 rounded-xl bg-[#0f0f0f] border border-white/8 overflow-hidden text-white select-none">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/8">
        {/* Logo / avatar */}
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: tickerColor(ticker) }}
        >
          {ticker.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{displayName}</p>
          <p className="text-xs text-gray-400 leading-tight">
            {ticker} · {quote.exchange || "NASDAQ"}
          </p>
        </div>
      </div>

      {/* ── Price block ────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold tracking-tight">${fmt(quote.price)}</span>
          <span className="text-base font-medium" style={{ color: priceColor }}>
            {isUp ? "+" : ""}{fmt(quote.change)}&nbsp;
            <span className="text-sm">
              {isUp ? "▲" : "▼"} {Math.abs(quote.change_pct ?? 0).toFixed(2)}%
            </span>
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">At close · {quote.currency}</p>

        {/* After-hours row */}
        {quote.post_market_price != null && (
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-sm font-medium text-gray-300">
              ${fmt(quote.post_market_price)}
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: (quote.post_market_change ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}
            >
              {(quote.post_market_change ?? 0) >= 0 ? "▲" : "▼"}&nbsp;
              {Math.abs(quote.post_market_change_pct ?? 0).toFixed(2)}%
            </span>
            <span className="text-[11px] text-gray-500">After-hours</span>
          </div>
        )}
      </div>

      {/* ── Range selector ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-4 pb-2">
        {RANGES.map(({ label, range }) => (
          <button
            key={label}
            onClick={() => loadRange(label, range)}
            className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
              activeRange === label
                ? "bg-white/15 text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div className="px-1">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            >
              <defs>
                {/* Split gradient: green above prevClose, red below */}
                <linearGradient id={`splitColor-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={0.08} />
                  <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.08} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id={`lineColor-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#22c55e" stopOpacity={1} />
                  <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={1} />
                  <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={1} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={1} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="date"
                tickFormatter={fmtLabel}
                interval={labelInterval}
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${fmt(v, 0)}`}
                width={58}
              />
              <Tooltip content={<ChartTooltip />} />

              {/* Prev close dashed reference line */}
              <ReferenceLine
                y={prevClose}
                stroke="#4b5563"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{
                  value: `Prev close: $${fmt(prevClose)}`,
                  position: "right",
                  fontSize: 9,
                  fill: "#6b7280",
                  dx: -4,
                }}
              />

              <Area
                type="monotone"
                dataKey="close"
                stroke={`url(#lineColor-${ticker})`}
                strokeWidth={1.5}
                fill={`url(#splitColor-${ticker})`}
                dot={false}
                activeDot={{ r: 3, fill: "#fff" }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-36 flex items-center justify-center text-gray-600 text-xs">
            No chart data available
          </div>
        )}
      </div>

      {/* ── Stats grid ────────────────────────────────────────────────────── */}
      <div className="border-t border-white/8 mx-0">
        {[0, 1, 2].map((rowIdx) => (
          <div
            key={rowIdx}
            className="grid grid-cols-3 divide-x divide-white/8 border-b border-white/8 last:border-b-0"
          >
            {stats.slice(rowIdx * 3, rowIdx * 3 + 3).map((s) => (
              <div key={s.label} className="px-3 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-tight">{s.label}</p>
                <p className="text-xs font-semibold text-gray-100 mt-0.5 leading-tight">{s.value}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
