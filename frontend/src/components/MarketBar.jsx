/**
 * MarketBar.jsx — Scrolling live ticker strip + Fear & Greed badge.
 *
 * Animates like a real financial terminal ticker tape.
 * Polls /mcp/market/overview every 60 s, Fear & Greed every 5 min.
 */

import React, { useEffect, useState, useRef } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

const FG_META = {
  'Extreme Fear': { text: 'text-red-400',     bg: 'bg-red-500/20',     bar: 'bg-red-500'     },
  'Fear':         { text: 'text-orange-400',  bg: 'bg-orange-500/20',  bar: 'bg-orange-400'  },
  'Neutral':      { text: 'text-yellow-400',  bg: 'bg-yellow-500/20',  bar: 'bg-yellow-400'  },
  'Greed':        { text: 'text-green-400',   bg: 'bg-green-500/20',   bar: 'bg-green-400'   },
  'Extreme Greed':{ text: 'text-emerald-400', bg: 'bg-emerald-500/20', bar: 'bg-emerald-400' },
}
function fgMeta(rating) {
  return FG_META[rating] ?? { text: 'text-gray-400', bg: 'bg-gray-700/20', bar: 'bg-gray-500' }
}

// Format price to a readable string based on magnitude
function fmt(price, symbol) {
  if (price == null) return '—'
  if (symbol === 'BTC-USD') return price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (symbol === 'ETH-USD') return price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (price >= 10000)  return price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (price >= 100)    return price.toFixed(2)
  if (price >= 1)      return price.toFixed(3)
  return price.toFixed(4)
}

export default function MarketBar() {
  const [indices, setIndices]  = useState([])
  const [fg, setFg]            = useState(null)
  const [ready, setReady]      = useState(false)
  const stripRef               = useRef(null)
  const animRef                = useRef(null)

  async function loadOverview() {
    try {
      const r = await fetch(`${MCP}/market/overview`)
      if (!r.ok) return
      const data = await r.json()
      setIndices(data.indices || [])
    } catch { /* silent */ }
  }

  async function loadFG() {
    try {
      const r = await fetch(`${MCP}/market/fear-greed`)
      if (!r.ok) return
      setFg(await r.json())
    } catch { /* silent */ }
  }

  useEffect(() => {
    Promise.all([loadOverview(), loadFG()]).then(() => setReady(true))
    const p = setInterval(loadOverview, 60_000)
    const q = setInterval(loadFG,       300_000)
    return () => { clearInterval(p); clearInterval(q) }
  }, [])

  if (!ready) {
    return (
      <div className="flex-shrink-0 h-8 flex items-center px-4"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-[10px] animate-pulse tracking-widest" style={{ color: 'var(--text-muted)' }}>
          LOADING MARKET DATA…
        </span>
      </div>
    )
  }

  const items    = [...indices, ...indices]
  const duration = `${Math.max(25, indices.length * 5)}s`

  return (
    <div className="flex-shrink-0 flex items-stretch"
      style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', height: '32px' }}>

      {/* ── Scrolling ticker strip ─────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex items-center relative min-w-0">
        <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--bg-elevated), transparent)' }} />
        <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--bg-elevated), transparent)' }} />

        <div
          ref={stripRef}
          className="flex items-center whitespace-nowrap"
          style={{ animation: `ticker-scroll ${duration} linear infinite`, willChange: 'transform' }}
        >
          {items.map((idx, i) => {
            const up = (idx.change_pct ?? 0) >= 0
            return (
              <span key={`${idx.symbol}-${i}`}
                className="inline-flex items-center gap-1.5 px-3 flex-shrink-0"
                style={{ borderRight: '1px solid var(--border-subtle)' }}>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  {idx.name}
                </span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(idx.price, idx.symbol)}
                </span>
                <span className="text-[10px] font-mono font-semibold"
                  style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                  {up ? '▲' : '▼'} {Math.abs(idx.change_pct ?? 0).toFixed(2)}%
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Fear & Greed badge ─────────────────────────────────────────── */}
      {fg && (() => {
        const { text, bg, bar } = fgMeta(fg.rating)
        const pct = Math.min(100, Math.max(0, fg.score))
        return (
          <div
            title={`Fear & Greed: ${fg.score} (${fg.rating})\nPrev: ${fg.previous_close} · 1W: ${fg.previous_1_week} · 1M: ${fg.previous_1_month}`}
            className={`flex-shrink-0 flex items-center gap-2 px-3 cursor-default ${bg}`}
            style={{ borderLeft: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-muted)' }}>F&amp;G</span>
            <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-[11px] font-bold font-mono ${text}`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fg.score}</span>
            <span className={`text-[10px] ${text} hidden md:inline`} style={{ opacity: 0.75 }}>{fg.rating}</span>
          </div>
        )
      })()}

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0) }
          100% { transform: translateX(-50%) }
        }
      `}</style>
    </div>
  )
}
