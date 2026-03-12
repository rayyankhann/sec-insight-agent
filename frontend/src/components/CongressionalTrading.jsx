/**
 * CongressionalTrading.jsx — Congressional STOCK Act disclosures.
 *
 * Primary source: House & Senate Stock Watcher (community S3).
 * Falls back gracefully to CapitolTrades.com deep-link when unavailable.
 */

import React, { useEffect, useState } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

const PARTY_COLORS = {
  D: 'bg-blue-900/60 text-blue-300 border-blue-800',
  R: 'bg-red-900/60  text-red-300  border-red-800',
  I: 'bg-gray-800    text-gray-300 border-gray-700',
}
function partyBadge(party) {
  const cls = PARTY_COLORS[(party || '').toUpperCase()] ?? PARTY_COLORS.I
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
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
      isBuy
        ? 'bg-green-900/60 text-green-300 border-green-800'
        : 'bg-red-900/60  text-red-300  border-red-800'
    }`}>
      {isBuy ? 'BUY' : 'SELL'}
    </span>
  )
}

function ExternalLink({ ticker }) {
  return (
    <div className="space-y-3">
      <div className="text-center py-4">
        <p className="text-3xl mb-3">🏛️</p>
        <p className="text-sm text-white font-medium mb-1">Congressional Trades</p>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          No local disclosures found for <span className="text-white font-mono">{ticker}</span>.
          View live STOCK Act filings on CapitolTrades.
        </p>
        <a
          href={`https://www.capitoltrades.com/trades?ticker=${ticker}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-purple-900/50 border border-purple-700 hover:bg-purple-900 text-purple-300 hover:text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View {ticker} on CapitolTrades
        </a>
      </div>

      {/* What this feature tracks */}
      <div className="bg-[#0d1424] border border-[#1f2937] rounded-lg p-3 space-y-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">About This Feature</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          The STOCK Act (2012) requires members of Congress to disclose stock trades
          within 45 days. This tab surfaces those filings — who bought/sold, how much,
          and when — for any company you search.
        </p>
      </div>
    </div>
  )
}

export default function CongressionalTrading({ ticker }) {
  const [trades, setTrades]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(false)
    setTrades([])

    fetch(`${MCP}/stock/${ticker}/congress`)
      .then(r => r.json())
      .then(data => {
        setTrades(data.trades || [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [ticker])

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500">Fetching STOCK Act disclosures…</p>
          <p className="text-[10px] text-gray-700">First load may take ~10 s</p>
        </div>
      </div>
    )
  }

  if (error || trades.length === 0) {
    return <ExternalLink ticker={ticker} />
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-white font-medium truncate max-w-[160px]">{t.member}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {partyBadge(t.party)}
              <span className="text-[10px] text-gray-600">{t.chamber}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {typeBadge(t.type)}
              {t.amount && <span className="text-[11px] text-gray-400 font-mono">{t.amount}</span>}
            </div>
            <span className="text-[10px] text-gray-600">{t.transaction_date}</span>
          </div>
          {t.asset_description && t.asset_description.length < 60 && (
            <p className="text-[10px] text-gray-600 truncate">{t.asset_description}</p>
          )}
        </div>
      ))}

      <div className="pt-2 text-center">
        <a
          href={`https://www.capitoltrades.com/trades?ticker=${ticker}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-purple-500 hover:text-purple-400 underline"
        >
          View all on CapitolTrades ↗
        </a>
      </div>
    </div>
  )
}
