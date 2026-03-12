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

function MiniQuote({ ticker, onRemove }) {
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
    <div className="flex items-center justify-between bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2.5 group hover:border-[#2d3748] transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-semibold text-white">{ticker}</span>
          {loading && <span className="w-2 h-2 rounded-full bg-gray-600 animate-pulse" />}
        </div>
        {quote?.company_name && (
          <p className="text-[10px] text-gray-600 truncate max-w-[130px]">{quote.company_name}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {err ? (
          <span className="text-[10px] text-gray-600">—</span>
        ) : quote ? (
          <div className="text-right">
            <p className="text-xs font-mono text-white">
              ${quote.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-[10px] font-mono ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{quote.change_pct?.toFixed(2)}%
            </p>
          </div>
        ) : null}

        {/* Remove button — visible on hover */}
        <button
          onClick={() => onRemove(ticker)}
          className="w-4 h-4 flex items-center justify-center text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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

export default function Watchlist({ onClose }) {
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
    <div className="flex flex-col h-full bg-[#0d1424] border-l border-[#1f2937]">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#1f2937]">
        <div>
          <h2 className="text-white font-semibold text-sm">Watchlist</h2>
          <p className="text-xs text-gray-600 mt-0.5">Prices update every 60 s</p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-[#1f2937] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Add input */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1f2937]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="Add ticker… (e.g. AAPL)"
            maxLength={10}
            className="flex-1 bg-[#111827] border border-[#1f2937] rounded-lg text-xs text-white placeholder-gray-600 px-3 py-2 focus:outline-none focus:border-blue-700 transition-colors"
          />
          <button
            onClick={addTicker}
            disabled={!input.trim()}
            className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors font-medium"
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
            <p className="text-xs text-gray-600">No tickers yet.</p>
            <p className="text-xs text-gray-700 mt-1">Type a symbol above and press Enter.</p>
          </div>
        ) : (
          tickers.map(t => (
            <MiniQuote key={t} ticker={t} onRemove={removeTicker} />
          ))
        )}
      </div>

      <div className="flex-shrink-0 border-t border-[#1f2937] px-4 py-2">
        <p className="text-[10px] text-gray-700 text-center">
          Saved locally · Data: Yahoo Finance
        </p>
      </div>
    </div>
  )
}
