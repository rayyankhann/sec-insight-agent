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

function isoPlusDays(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function eventDateTime(ev) {
  // ev.date is ISO (YYYY-MM-DD), ev.time_gmt is HH:MM in GMT
  try {
    const [year, month, day] = (ev.date || '').split('-').map(Number)
    const [h, m] = (ev.time_gmt || '00:00').split(':').map(Number)
    // Construct as UTC so comparisons are stable
    return new Date(Date.UTC(year, month - 1, day, h, m || 0, 0, 0))
  } catch {
    return null
  }
}

function formatCountdown(target) {
  if (!target) return ''
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'Now'
  const totalMinutes = Math.round(diffMs / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
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

function SectionHeader({ title, loading, right }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest flex-shrink-0"
        style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
        {title}
      </h3>
      <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      {loading && <span className="text-[10px] animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</span>}
      {right}
    </div>
  )
}

function NextEventCard({ ev }) {
  const dt = eventDateTime(ev)
  const countdown = dt ? formatCountdown(dt) : ''
  const isHigh = ev.impact === 'high'
  const impactLabel = ev.impact_score != null ? `${ev.impact_score}/10` : ev.impact
  const assets = Array.isArray(ev.affected_assets) ? ev.affected_assets.slice(0, 4) : []

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-base)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isHigh ? '#f87171' : '#fbbf24' }}
          />
          <span
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Next Macro Event
          </span>
        </div>
        {countdown && (
          <span
            className="text-[11px] font-medium"
            style={{ color: 'var(--blue-hover)' }}
          >
            in {countdown}
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {ev.event}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {dt && (
              <span style={{ color: 'var(--text-secondary)' }}>
                {dt.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                ·{' '}
                {dt.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded-full"
              style={{
                color: isHigh ? '#fecaca' : '#fef3c7',
                background: isHigh
                  ? 'rgba(248,113,113,0.12)'
                  : 'rgba(251,191,36,0.12)',
                border: isHigh
                  ? '1px solid rgba(248,113,113,0.35)'
                  : '1px solid rgba(251,191,36,0.35)',
              }}
            >
              {impactLabel}
            </span>
          </div>
        </div>

        {assets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {assets.map((a) => (
              <span
                key={a}
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  background: 'var(--bg-interactive)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MarketCard({ item }) {
  const up = (item.change_pct ?? 0) >= 0
  return (
    <div className="relative rounded-xl p-4 overflow-hidden transition-all duration-200 group"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${up ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = up ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = up ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)' }}>
      {/* Corner glow */}
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full blur-2xl pointer-events-none"
        style={{ background: up ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)', opacity: 0.8 }} />

      <p className="text-[10px] uppercase tracking-widest font-medium truncate"
        style={{ color: 'var(--text-muted)' }}>
        {item.name}
      </p>
      <p className="text-xl font-bold mt-1 leading-none font-mono"
        style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
        {fmtPrice(item.price, item.symbol)}
      </p>
      <p className="text-sm font-semibold mt-1.5 flex items-center gap-1"
        style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
        {up ? '▲' : '▼'} {Math.abs(item.change_pct ?? 0).toFixed(2)}%
        <span className="text-xs font-normal ml-1" style={{ opacity: 0.55 }}>
          {up ? '+' : ''}{item.change != null ? item.change.toFixed(2) : ''}
        </span>
      </p>
    </div>
  )
}

function EventPill({ ev }) {
  const isHigh = ev.impact === 'high'
  return (
    <div className="flex-shrink-0 flex flex-col gap-1 px-3 py-2.5 rounded-xl min-w-[160px] max-w-[200px]"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isHigh ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.15)'}`,
      }}>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: isHigh ? '#f87171' : '#fbbf24' }} />
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtTime(ev.time_gmt)}
        </span>
        {ev.impact_score >= 7 && (
          <span className="text-[9px] font-bold ml-auto px-1 py-0.5 rounded"
            style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
            {ev.impact_score}/10
          </span>
        )}
      </div>
      <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>
        {ev.event}
      </p>
      {ev.forecast && (
        <span className="text-[10px]" style={{ color: 'var(--blue-hover)' }}>Fcst: {ev.forecast}</span>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeScreen({ onSend, isLoading = false }) {
  const [market, setMarket] = useState([])
  const [events, setEvents] = useState([])
  const [nextEvent, setNextEvent] = useState(null)
  const [earnings, setEarnings] = useState([])
  const [loadingMarket, setLoadingMarket] = useState(true)
  const [lastSession, setLastSession] = useState(null)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    // Load last session metadata (if any)
    try {
      const raw = typeof window !== 'undefined'
        ? window.localStorage.getItem('sec_insight_last_session')
        : null
      if (raw) {
        const parsed = JSON.parse(raw)
        setLastSession(parsed)
      }
    } catch {
      // ignore
    }

    // Load market overview
    fetch(`${MCP}/market/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMarket(d.indices || []) })
      .catch(() => {})
      .finally(() => setLoadingMarket(false))

    // Load high / medium impact events for today + next few days
    const today = isoToday()
    const to = isoPlusDays(3)
    fetch(`${MCP}/calendar/economic?date_from=${today}&date_to=${to}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const all = (d.events || []).filter(
          e => e.impact === 'high' || e.impact === 'medium'
        )

        // Today's strip
        const todayEvents = all
          .filter(e => e.date === today)
          .slice(0, 6)
        setEvents(todayEvents)

        // Next upcoming event (today or next few days)
        const now = new Date()
        const withDt = all
          .map(e => ({ ev: e, dt: eventDateTime(e) }))
          .filter(x => x.dt && x.dt >= now)

        if (withDt.length > 0) {
          withDt.sort((a, b) => {
            const diff = a.dt - b.dt
            if (diff !== 0) return diff
            const ia = a.ev.impact_score ?? 0
            const ib = b.ev.impact_score ?? 0
            return ib - ia
          })
          setNextEvent(withDt[0].ev)
        }
      })
      .catch(() => {})

    // Lightweight earnings radar: today -> next 3 days
    fetch(`${MCP}/earnings/calendar?date_from=${today}&date_to=${to}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const rows = (d.events || []).slice(0, 8)
        setEarnings(rows)
      })
      .catch(() => {})
  }, [])

  // Pick the 6 configured card symbols (preserving order)
  const cards = CARD_SYMBOLS
    .map(sym => market.find(m => m.symbol === sym))
    .filter(Boolean)

  const canSend = inputValue.trim().length > 0 && !isLoading

  function handleSubmit() {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInputValue('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 max-w-3xl mx-auto w-full">

      {/* ── Hero with welcome message + glassy chat card ──────────────────── */}
      <div className="pt-6 flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5"
          style={{
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid var(--border-subtle)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--blue)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Welcome to SEC Insight Agent
          </span>
        </div>
        <h2
          className="text-2xl font-semibold leading-tight"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          Ask anything about public company filings.
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Combine live SEC EDGAR data, market context, and macro events into one conversation.
        </p>

        {/* Glassy chat card */}
        <div className="w-full max-w-2xl">
          <div
            className="rounded-3xl px-5 py-4"
            style={{
              background:
                'radial-gradient(circle at top, rgba(59,130,246,0.35), transparent 55%), rgba(15,23,42,0.92)',
              border: '1px solid var(--border-base)',
              boxShadow: '0 22px 70px rgba(0,0,0,0.9)',
            }}
          >
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              placeholder="Initiate a query or send a command to the AI…"
              className="w-full bg-transparent text-sm resize-none outline-none leading-relaxed"
              style={{
                color: 'var(--text-primary)',
                caretColor: 'var(--blue)',
                maxHeight: '120px',
                fontFamily: 'inherit',
              }}
            />
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span style={{ color: 'var(--text-muted)' }}>
                Enter to send · Shift+Enter for new line
              </span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSend}
                className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: canSend ? 'var(--blue)' : 'var(--bg-hover)',
                  color: canSend ? '#fff' : 'var(--text-muted)',
                  boxShadow: canSend ? '0 0 20px rgba(59,130,246,0.6)' : 'none',
                  opacity: isLoading ? 0.7 : 1,
                  cursor: canSend ? 'pointer' : 'not-allowed',
                }}
              >
                Ask SEC Insight
              </button>
            </div>
          </div>

          {/* Tool chips row */}
          <div className="mt-3 flex flex-wrap gap-2 justify-center text-[11px]">
            <button
              type="button"
              onClick={() => onSend("Scan today's macro events that matter for US equities.")}
              className="px-3 py-1.5 rounded-full"
              style={{
                background: 'var(--bg-interactive)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              Macro Overview
            </button>
            <button
              type="button"
              onClick={() => onSend("Summarize the most important risks in Tesla's latest 10-K.")}
              className="px-3 py-1.5 rounded-full"
              style={{
                background: 'var(--bg-interactive)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              Filing Summary
            </button>
            <button
              type="button"
              onClick={() => onSend("Show key insider and institutional activity for NVDA.")}
              className="px-3 py-1.5 rounded-full"
              style={{
                background: 'var(--bg-interactive)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              Ownership & Flows
            </button>
          </div>
        </div>
      </div>

      {/* ── Resume last session ──────────────────────────────────────────── */}
      {lastSession?.query && (
        <section>
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="min-w-0">
              <p
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Last time you were looking at{' '}
                <span style={{ color: 'var(--text-primary)' }}>
                  {lastSession.company_name || lastSession.company_ticker || 'a filing query'}
                </span>
                .
              </p>
            </div>
            <button
              onClick={() => onSend(lastSession.query)}
              className="text-xs font-medium rounded-lg px-3 py-1.5 transition-all"
              style={{
                background: 'var(--blue)',
                color: '#fff',
                boxShadow: '0 2px 10px rgba(64,144,232,0.35)',
              }}
            >
              Resume
            </button>
          </div>
        </section>
      )}

      {/* ── Market Overview Cards ─────────────────────────────────────────── */}
      {nextEvent && (
        <section>
          <NextEventCard ev={nextEvent} />
        </section>
      )}

      {/* ── Market Overview Cards ─────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Live Markets" loading={loadingMarket} right={null} />
        {cards.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {cards.map(item => <MarketCard key={item.symbol} item={item} />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl p-4 h-[88px] animate-pulse"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
        )}
      </section>

      {/* ── Today's Key Events ───────────────────────────────────────────── */}
      {events.length > 0 && (
        <section>
          <SectionHeader title="Today's Key Events"
            right={<span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{isoToday()}</span>} />
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {events.map((ev, i) => <EventPill key={i} ev={ev} />)}
          </div>
        </section>
      )}

      {/* ── Earnings Radar (next few days) ───────────────────────────────── */}
      {earnings.length > 0 && (
        <section>
          <SectionHeader title="Earnings Radar" />
          <div className="flex flex-wrap gap-2 text-[11px]">
            {earnings.map((e, idx) => (
              <div
                key={`${e.ticker}-${idx}`}
                className="px-2.5 py-1.5 rounded-lg"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span
                  className="font-mono font-semibold mr-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {e.ticker}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {e.date} · {e.when || 'TBA'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Query Suggestions ────────────────────────────────────────────── */}
      <section className="pb-6">
        <SectionHeader title="Try Asking" />
        <div className="grid grid-cols-2 gap-2.5">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onSend(s.query)}
              className="group text-left flex items-start gap-3 px-4 py-3.5 rounded-xl transition-all duration-150 hover:scale-[1.015] active:scale-[0.99]"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-base)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-base)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
            >
              <span className="mt-0.5 flex-shrink-0 transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.parentElement.dispatchEvent(new MouseEvent('mouseenter'))}
              >
                {s.icon}
              </span>
              <span className="text-sm leading-snug transition-colors"
                style={{ color: 'var(--text-secondary)' }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
