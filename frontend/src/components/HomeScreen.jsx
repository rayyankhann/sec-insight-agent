/**
 * HomeScreen.jsx — Rich landing screen shown before the first chat message.
 *
 * Sections:
 *  1. Hero heading + subtitle
 *  2. Live market overview cards (6 instruments, reuses /mcp/market/overview)
 *  3. Today's key economic events strip (/mcp/calendar/economic for today only)
 *  4. Styled query suggestion grid (click to send)
 */

import { useState, useEffect } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtPrice(price, symbol) {
  if (price == null) return '—'
  if (symbol === 'BTC-USD' || symbol === 'ETH-USD')
    return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (symbol === '^VIX' || symbol === '^TNX')
    return price.toFixed(2)
  if (price >= 1000)
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return price.toFixed(2)
}

function fmtTime(gmtStr) {
  if (!gmtStr) return ''
  try {
    const [h, m] = gmtStr.split(':').map(Number)
    const d = new Date()
    d.setUTCHours(h, m, 0, 0)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return gmtStr }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Instruments shown in the overview grid ───────────────────────────────────
// (subset of the 12 returned by market/overview; pick the most recognisable 6)
const CARD_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', 'GC=F', 'BTC-USD', '^VIX']

// ─── Pre-defined query suggestions ───────────────────────────────────────────
const SUGGESTIONS = [
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: "What risks did Tesla disclose in their latest 10-K?",
    query: "What risks did Tesla disclose in their latest 10-K?",
    accent: 'from-blue-900/40 to-blue-950/20 border-blue-800/40 hover:border-blue-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    label: "How did Apple's revenue change year over year?",
    query: "How did Apple's revenue change year over year?",
    accent: 'from-green-900/40 to-green-950/20 border-green-800/40 hover:border-green-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    label: "Summarize Microsoft's AI strategy from their latest filing",
    query: "Summarize Microsoft's AI strategy from their latest 10-K filing",
    accent: 'from-purple-900/40 to-purple-950/20 border-purple-800/40 hover:border-purple-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    label: "What is NVIDIA's business overview from their 10-K?",
    query: "What is NVIDIA's business overview from their latest 10-K?",
    accent: 'from-indigo-900/40 to-indigo-950/20 border-indigo-800/40 hover:border-indigo-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "What was Amazon's total debt in their most recent annual report?",
    query: "What was Amazon's total debt in their most recent annual report?",
    accent: 'from-amber-900/40 to-amber-950/20 border-amber-800/40 hover:border-amber-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    label: "Show Meta's most recent 8-K filings",
    query: "Show me Meta's most recent 8-K filings",
    accent: 'from-cyan-900/40 to-cyan-950/20 border-cyan-800/40 hover:border-cyan-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    label: "Who are the key executives at Google's parent company?",
    query: "Who are the key executives at Alphabet and what did they say in their latest 10-K?",
    accent: 'from-rose-900/40 to-rose-950/20 border-rose-800/40 hover:border-rose-600/60',
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
    label: "What are Tesla's plans for international expansion?",
    query: "What does Tesla say about international expansion in their latest SEC filings?",
    accent: 'from-teal-900/40 to-teal-950/20 border-teal-800/40 hover:border-teal-600/60',
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function MarketCard({ item }) {
  const up = (item.change_pct ?? 0) >= 0
  return (
    <div className={`relative rounded-xl border p-4 bg-gradient-to-br transition-all duration-200 overflow-hidden
      ${up
        ? 'from-green-950/30 to-[#0d1424] border-green-900/30 hover:border-green-700/50'
        : 'from-red-950/30 to-[#0d1424] border-red-900/30 hover:border-red-700/50'
      }`}>
      {/* Subtle glow in corner */}
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full blur-2xl opacity-20
        ${up ? 'bg-green-400' : 'bg-red-400'}`} />

      <p className="text-[11px] text-gray-500 uppercase tracking-widest font-medium truncate">
        {item.name}
      </p>
      <p className="text-xl font-bold text-white font-mono mt-1 leading-none">
        {fmtPrice(item.price, item.symbol)}
      </p>
      <p className={`text-sm font-semibold mt-1.5 flex items-center gap-1 ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(item.change_pct ?? 0).toFixed(2)}%
        <span className="text-xs font-normal opacity-60 ml-1">
          {up ? '+' : ''}{item.change != null ? item.change.toFixed(2) : ''}
        </span>
      </p>
    </div>
  )
}

function EventPill({ ev }) {
  const isHigh = ev.impact === 'high'
  return (
    <div className={`flex-shrink-0 flex flex-col gap-1 px-3 py-2.5 rounded-xl border min-w-[160px] max-w-[200px]
      ${isHigh
        ? 'bg-red-950/20 border-red-900/40'
        : 'bg-yellow-950/10 border-yellow-900/30'
      }`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isHigh ? 'bg-red-500' : 'bg-yellow-400'}`} />
        <span className="text-[10px] text-gray-500 font-mono">{fmtTime(ev.time_gmt)}</span>
        {ev.impact_score >= 7 && (
          <span className="text-[9px] font-bold text-red-400 bg-red-950 border border-red-800 px-1 py-0.5 rounded ml-auto">
            {ev.impact_score}/10
          </span>
        )}
      </div>
      <p className="text-xs text-gray-200 font-medium leading-tight line-clamp-2">{ev.event}</p>
      {ev.forecast && (
        <span className="text-[10px] text-blue-400">F: {ev.forecast}</span>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeScreen({ onSend }) {
  const [market, setMarket] = useState([])
  const [events, setEvents] = useState([])
  const [loadingMarket, setLoadingMarket] = useState(true)

  useEffect(() => {
    // Load market overview
    fetch(`${MCP}/market/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMarket(d.indices || []) })
      .catch(() => {})
      .finally(() => setLoadingMarket(false))

    // Load today's events (high + medium impact only)
    const today = isoToday()
    fetch(`${MCP}/calendar/economic?date_from=${today}&date_to=${today}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const notable = (d.events || [])
          .filter(e => e.impact === 'high' || e.impact === 'medium')
          .slice(0, 6)
        setEvents(notable)
      })
      .catch(() => {})
  }, [])

  // Pick the 6 configured card symbols (preserving order)
  const cards = CARD_SYMBOLS
    .map(sym => market.find(m => m.symbol === sym))
    .filter(Boolean)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8 max-w-4xl mx-auto w-full">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="text-center pt-4">
        <div className="inline-flex items-center gap-2 bg-blue-950/40 border border-blue-800/30 rounded-full px-4 py-1.5 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs text-blue-400 font-medium tracking-wide">
            Powered by SEC EDGAR · Live Market Data
          </span>
        </div>
        <h2 className="text-2xl font-bold text-white leading-tight">
          What would you like to research today?
        </h2>
        <p className="text-gray-500 text-sm mt-2">
          Ask about any public company's filings, financials, risks, or executive outlook.
        </p>
      </div>

      {/* ── Market Overview Cards ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Live Markets
          </h3>
          <div className="flex-1 h-px bg-[#1f2937]" />
          {loadingMarket && (
            <span className="text-[10px] text-gray-700 animate-pulse">Loading…</span>
          )}
        </div>
        {cards.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {cards.map(item => <MarketCard key={item.symbol} item={item} />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-[#1f2937] bg-[#0d1424] p-4 animate-pulse h-[88px]" />
            ))}
          </div>
        )}
      </section>

      {/* ── Today's Key Events ───────────────────────────────────────────── */}
      {events.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Today's Key Events
            </h3>
            <div className="flex-1 h-px bg-[#1f2937]" />
            <span className="text-[10px] text-gray-600">{isoToday()}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {events.map((ev, i) => <EventPill key={i} ev={ev} />)}
          </div>
        </section>
      )}

      {/* ── Query Suggestions ────────────────────────────────────────────── */}
      <section className="pb-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Try Asking
          </h3>
          <div className="flex-1 h-px bg-[#1f2937]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onSend(s.query)}
              className={`group text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border
                bg-gradient-to-br transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]
                ${s.accent}`}
            >
              <span className="text-gray-500 group-hover:text-gray-300 transition-colors mt-0.5 flex-shrink-0">
                {s.icon}
              </span>
              <span className="text-sm text-gray-400 group-hover:text-gray-200 leading-snug transition-colors">
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
