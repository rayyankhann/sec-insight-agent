/**
 * OptionsFlow.jsx — Options chain summary with put/call ratio.
 *
 * Shows top calls + puts by open interest across the 4 nearest expirations.
 * Data from yfinance (free, no API key).
 */

import React, { useEffect, useState } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtPct(n) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(0)}%`
}

function ContractRow({ c, spot }) {
  const isCall = c.type === 'call'
  const oi = c.open_interest ?? 0
  const iv = c.implied_volatility != null ? `${(c.implied_volatility * 100).toFixed(1)}%` : '—'
  const itm = c.in_the_money

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] ${
      itm
        ? isCall ? 'bg-green-950/30 border-green-900/50' : 'bg-red-950/30 border-red-900/50'
        : 'bg-[#0d1424] border-[#1f2937]'
    }`}>
      <div className="w-16 text-gray-300 font-mono font-semibold">${c.strike}</div>
      <div className="flex-1 text-gray-500 text-[10px] truncate">{c.expiration}</div>
      <div className="w-10 text-right text-gray-400 font-mono">{iv}</div>
      <div className="w-12 text-right text-gray-300 font-mono">{fmt(oi)}</div>
      {itm && (
        <span className={`text-[9px] font-bold px-1 rounded ${
          isCall ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
        }`}>ITM</span>
      )}
    </div>
  )
}

export default function OptionsFlow({ ticker }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [view, setView]       = useState('calls')

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`${MCP}/stock/${ticker}/options`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(`Could not load options data.`); setLoading(false) })
  }, [ticker])

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-500">Loading options chain…</p>
      </div>
    )
  }

  if (error) return <p className="text-xs text-red-400 text-center py-6">{error}</p>
  if (!data)  return null

  const pcr = data.put_call_ratio
  const callOI = data.total_call_oi
  const putOI  = data.total_put_oi
  const totalOI = callOI + putOI
  const callPct = totalOI ? Math.round((callOI / totalOI) * 100) : 50
  const putPct  = 100 - callPct

  const pcrColor = pcr == null ? 'text-gray-400'
    : pcr > 1.2  ? 'text-red-400'
    : pcr < 0.7  ? 'text-green-400'
    : 'text-yellow-400'

  const contracts = view === 'calls' ? data.calls : data.puts

  return (
    <div className="space-y-3">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-gray-600 mb-1">Put/Call Ratio</p>
          <p className={`text-base font-bold font-mono ${pcrColor}`}>
            {pcr != null ? pcr.toFixed(2) : '—'}
          </p>
          <p className="text-[9px] text-gray-700 mt-0.5">
            {pcr == null ? '' : pcr > 1.2 ? 'Bearish' : pcr < 0.7 ? 'Bullish' : 'Neutral'}
          </p>
        </div>
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-gray-600 mb-1">Call OI</p>
          <p className="text-base font-bold font-mono text-green-400">{fmt(callOI)}</p>
          <p className="text-[9px] text-green-800">{callPct}%</p>
        </div>
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-gray-600 mb-1">Put OI</p>
          <p className="text-base font-bold font-mono text-red-400">{fmt(putOI)}</p>
          <p className="text-[9px] text-red-900">{putPct}%</p>
        </div>
      </div>

      {/* OI bar */}
      <div className="h-1.5 rounded-full bg-[#1f2937] overflow-hidden flex">
        <div className="h-full bg-green-600 transition-all" style={{ width: `${callPct}%` }} />
        <div className="h-full bg-red-700 transition-all" style={{ width: `${putPct}%` }} />
      </div>

      {/* Expirations */}
      <p className="text-[10px] text-gray-600">
        Expirations: {data.expirations.join(' · ')}
      </p>

      {/* Call / Put toggle */}
      <div className="flex gap-1">
        {['calls', 'puts'].map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors capitalize ${
              view === v
                ? v === 'calls'
                  ? 'bg-green-900/60 text-green-300 border border-green-800'
                  : 'bg-red-900/60 text-red-300 border border-red-800'
                : 'bg-[#111827] text-gray-500 border border-[#1f2937] hover:text-gray-300'
            }`}
          >
            {v === 'calls' ? `📈 Calls (${data.calls.length})` : `📉 Puts (${data.puts.length})`}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 text-[10px] text-gray-600 uppercase tracking-wide">
        <div className="w-16">Strike</div>
        <div className="flex-1">Expiry</div>
        <div className="w-10 text-right">IV</div>
        <div className="w-12 text-right">OI</div>
        <div className="w-8" />
      </div>

      {/* Contract list */}
      <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
        {contracts.length === 0
          ? <p className="text-xs text-gray-600 text-center py-4">No contracts found.</p>
          : contracts.map((c, i) => <ContractRow key={i} c={c} />)
        }
      </div>

      <p className="text-[10px] text-gray-700 text-center pt-1">
        Top by Open Interest · Source: Yahoo Finance
      </p>
    </div>
  )
}
