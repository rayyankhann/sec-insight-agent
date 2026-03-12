/**
 * InstitutionalHoldings.jsx — Top 13F institutional holders.
 *
 * Shows % held by institutions, insiders, and top individual holders
 * with quarter-over-quarter change. Data from yfinance (aggregated 13F).
 */

import React, { useEffect, useState } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function fmtShares(n) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default function InstitutionalHoldings({ ticker }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`${MCP}/stock/${ticker}/institutions`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Could not load institutional holdings.'); setLoading(false) })
  }, [ticker])

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-500">Loading 13F data…</p>
      </div>
    )
  }

  if (error) return <p className="text-xs text-red-400 text-center py-6">{error}</p>
  if (!data)  return null

  const instPct = data.pct_institutions
  const insPct  = data.pct_insiders
  const count   = data.institutions_count

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-gray-600 mb-1">Institutions</p>
          <p className="text-base font-bold text-white">{instPct != null ? `${instPct}%` : '—'}</p>
        </div>
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-gray-600 mb-1">Insiders</p>
          <p className="text-base font-bold text-white">{insPct != null ? `${insPct}%` : '—'}</p>
        </div>
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-gray-600 mb-1"># Holders</p>
          <p className="text-base font-bold text-white">
            {count != null ? count.toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {/* Ownership bar */}
      {instPct != null && insPct != null && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>Institutional {instPct}%</span>
            <span>Insider {insPct}%</span>
            <span>Other {Math.max(0, 100 - instPct - insPct).toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#1f2937] overflow-hidden flex">
            <div className="h-full bg-blue-600" style={{ width: `${Math.min(instPct, 100)}%` }} />
            <div className="h-full bg-amber-600" style={{ width: `${Math.min(insPct, 100 - instPct)}%` }} />
          </div>
        </div>
      )}

      {/* Top holders list */}
      <div>
        <p className="text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-2">
          Top Institutional Holders · 13F Filings
        </p>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-2 mb-1 text-[10px] text-gray-600 uppercase tracking-wide">
          <div className="flex-1">Holder</div>
          <div className="w-12 text-right">% Held</div>
          <div className="w-16 text-right">Shares</div>
          <div className="w-8 text-right">Chg</div>
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {data.holders.map((h, i) => {
            const chg = h.pct_change
            const chgColor = chg == null ? 'text-gray-600'
              : chg > 0 ? 'text-green-400' : chg < 0 ? 'text-red-400' : 'text-gray-500'
            const chgStr = chg == null ? '—'
              : chg > 0 ? `+${chg.toFixed(1)}%` : `${chg.toFixed(1)}%`

            return (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-2 rounded-lg bg-[#0d1424] border border-[#1f2937] hover:border-[#2d3748] transition-colors"
              >
                {/* Rank */}
                <span className="w-4 text-[10px] text-gray-700 font-mono flex-shrink-0">{i + 1}</span>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{h.name}</p>
                  {h.date_reported && (
                    <p className="text-[9px] text-gray-600">{h.date_reported}</p>
                  )}
                </div>

                {/* % held */}
                <div className="w-12 text-right">
                  <p className="text-xs text-gray-300 font-mono">
                    {h.pct_held != null ? `${h.pct_held.toFixed(2)}%` : '—'}
                  </p>
                </div>

                {/* Shares */}
                <div className="w-16 text-right">
                  <p className="text-xs text-gray-400 font-mono">{fmtShares(h.shares)}</p>
                </div>

                {/* QoQ change */}
                <div className="w-8 text-right">
                  <p className={`text-[10px] font-mono ${chgColor}`}>{chgStr}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[10px] text-gray-700 text-center pt-1">
        Source: SEC 13F Filings · Via Yahoo Finance
      </p>
    </div>
  )
}
