/**
 * CongressionalTrading.jsx — Recent congressional stock disclosures.
 *
 * Data: House & Senate Stock Watcher S3 buckets (free, no API key).
 * First load may take a few seconds while the server downloads + caches the file.
 */

import React, { useEffect, useState } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

const PARTY_COLORS = {
  D: 'bg-blue-900 text-blue-300 border-blue-800',
  R: 'bg-red-900  text-red-300  border-red-800',
  I: 'bg-gray-800 text-gray-300 border-gray-700',
}

function partyBadge(party) {
  const cls = PARTY_COLORS[party?.toUpperCase()] ?? PARTY_COLORS.I
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {party || '?'}
    </span>
  )
}

function typeBadge(type) {
  const t = (type || '').toLowerCase()
  const isBuy = t.includes('purchase') || t.includes('buy')
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
      isBuy
        ? 'bg-green-900 text-green-300 border border-green-800'
        : 'bg-red-900  text-red-300  border border-red-800'
    }`}>
      {isBuy ? 'BUY' : 'SELL'}
    </span>
  )
}

export default function CongressionalTrading({ ticker }) {
  const [trades, setTrades]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(null)

    fetch(`${MCP}/stock/${ticker}/congress`)
      .then(r => r.json())
      .then(data => {
        setTrades(data.trades || [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load congressional data.')
        setLoading(false)
      })
  }, [ticker])

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500">Fetching disclosures…<br/>
            <span className="text-gray-600 text-[10px]">First load may take ~10 s</span>
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-red-400 text-center py-6">{error}</p>
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-2xl mb-2">🏛️</p>
        <p className="text-xs text-gray-500">No congressional disclosures found for {ticker}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-600 text-center mb-3">
        {trades.length} disclosure{trades.length !== 1 ? 's' : ''} · House &amp; Senate STOCK Act
      </p>

      {trades.map((t, i) => (
        <div
          key={i}
          className="bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2.5 space-y-1.5"
        >
          {/* Row 1: member + party + chamber */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-white font-medium truncate max-w-[160px]">
              {t.member}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {partyBadge(t.party)}
              <span className="text-[10px] text-gray-500">{t.chamber}</span>
            </div>
          </div>

          {/* Row 2: type badge + amount + date */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {typeBadge(t.type)}
              {t.amount && (
                <span className="text-[11px] text-gray-400 font-mono">{t.amount}</span>
              )}
            </div>
            <span className="text-[10px] text-gray-600 flex-shrink-0">{t.transaction_date}</span>
          </div>

          {/* Row 3: asset description (optional) */}
          {t.asset_description && t.asset_description.length < 60 && (
            <p className="text-[10px] text-gray-600 truncate">{t.asset_description}</p>
          )}
        </div>
      ))}

      <p className="text-[10px] text-gray-700 text-center pt-2">
        Source: House &amp; Senate Stock Watcher · STOCK Act Disclosures
      </p>
    </div>
  )
}
