/**
 * Watchlist.jsx — Pinned tickers with live mini price widgets.
 *
 * State persisted in localStorage — zero backend cost.
 * Prices fetched from existing /mcp/stock/{ticker}/quote endpoint.
 */

import React, { useEffect, useState, useCallback } from 'react'

const MCP         = import.meta.env.VITE_MCP_URL ?? '/mcp'
const LS_KEY      = 'sec_insight_watchlist'
const POLL_MS     = 60_000

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}

function saveTickers(tickers) {
  localStorage.setItem(LS_KEY, JSON.stringify(tickers))
}

function MiniQuote({ ticker, onRemove, onAsk }) {
  const [quote, setQuote]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${MCP}/stock/${ticker}/quote`)
      if (!r.ok) throw new Error('bad')
      const d = await r.json()
      setQuote(d)
      setErr(false)
    } catch {
      setErr(true)
    } finally {
      setLoading(false)
    }
  }, [ticker])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const up = (quote?.change_pct ?? 0) >= 0

  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 group transition-all duration-150"
      style={{ background: 'var(--bg-interactive)', border: '1px solid var(--border-subtle)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-base)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{ticker}</span>
          {loading && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-muted)' }} />}
        </div>
        {quote?.company_name && (
          <p className="text-[10px] truncate max-w-[130px]" style={{ color: 'var(--text-muted)' }}>{quote.company_name}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {err ? (
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
        ) : quote ? (
          <div className="text-right">
            <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
              ${quote.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] font-mono" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
              {up ? '+' : ''}{quote.change_pct?.toFixed(2)}%
            </p>
          </div>
        ) : null}

        {onAsk && (
          <button
            onClick={() => onAsk(ticker)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-medium transition-colors"
            style={{
              color: 'var(--blue-hover)',
              background: 'rgba(64,144,232,0.08)',
              border: '1px solid rgba(64,144,232,0.25)',
            }}
            title="Ask about this ticker"
          >
            Ask
          </button>
        )}

        <button
          onClick={() => onRemove(ticker)}
          className="w-4 h-4 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          title="Remove"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function Watchlist({ onClose, onAsk }) {
  const [tickers, setTickers] = useState(loadSaved)
  const [input, setInput]     = useState('')

  function addTicker() {
    const t = input.trim().toUpperCase()
    if (!t || tickers.includes(t)) { setInput(''); return }
    const next = [...tickers, t]
    setTickers(next)
    saveTickers(next)
    setInput('')
  }

  function removeTicker(t) {
    const next = tickers.filter(x => x !== t)
    setTickers(next)
    saveTickers(next)
  }

  function handleKey(e) {
    if (e.key === 'Enter') addTicker()
  }

  return (
    <div className="flex flex-col h-full animate-fade-in"
      style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Watchlist</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Updates every 60 s</p>
        </div>
        <button onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Add input */}
      <div className="flex-shrink-0 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="Add ticker… (e.g. AAPL)"
            maxLength={10}
            className="flex-1 rounded-lg text-xs px-3 py-2 focus:outline-none transition-colors"
            style={{
              background: 'var(--bg-interactive)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={addTicker}
            disabled={!input.trim()}
            className="px-3 py-2 text-white text-xs rounded-lg transition-all font-medium disabled:opacity-40"
            style={{ background: 'var(--blue)', boxShadow: '0 2px 10px rgba(64,144,232,0.3)' }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {tickers.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-2xl mb-2">📌</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No tickers yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Type a symbol above and press Enter.</p>
          </div>
        ) : (
          tickers.map(t => (
            <MiniQuote key={t} ticker={t} onRemove={removeTicker} onAsk={onAsk} />
          ))
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
          Saved locally · Data: Yahoo Finance
        </p>
      </div>
    </div>
  )
}
