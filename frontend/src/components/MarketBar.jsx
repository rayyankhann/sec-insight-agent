/**
 * MarketBar.jsx — Slim live-price strip for major indices + Fear & Greed.
 *
 * Polls /mcp/market/overview every 60 s and /mcp/market/fear-greed every 5 min.
 * All data is free (yfinance + CNN public endpoint).
 */

import React, { useEffect, useState, useRef } from 'react'

const MCP = import.meta.env.VITE_MCP_URL ?? '/mcp'

const FG_COLORS = {
  'Extreme Fear': { text: 'text-red-400',    bar: 'bg-red-500'    },
  'Fear':         { text: 'text-orange-400', bar: 'bg-orange-400' },
  'Neutral':      { text: 'text-yellow-400', bar: 'bg-yellow-400' },
  'Greed':        { text: 'text-green-400',  bar: 'bg-green-400'  },
  'Extreme Greed':{ text: 'text-emerald-400',bar: 'bg-emerald-400'},
}

function fgColor(rating) {
  return FG_COLORS[rating] ?? { text: 'text-gray-400', bar: 'bg-gray-500' }
}

export default function MarketBar() {
  const [indices, setIndices]  = useState([])
  const [fg, setFg]            = useState(null)
  const [loading, setLoading]  = useState(true)
  const fetchedOnce            = useRef(false)

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
    async function init() {
      setLoading(true)
      await Promise.all([loadOverview(), loadFG()])
      setLoading(false)
      fetchedOnce.current = true
    }
    init()

    const priceTimer = setInterval(loadOverview, 60_000)
    const fgTimer    = setInterval(loadFG,       300_000)
    return () => { clearInterval(priceTimer); clearInterval(fgTimer) }
  }, [])

  if (loading && !fetchedOnce.current) {
    return (
      <div className="flex-shrink-0 bg-[#0c1220] border-b border-[#1f2937] h-8 flex items-center px-4">
        <span className="text-xs text-gray-600 animate-pulse">Loading market data…</span>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 bg-[#0c1220] border-b border-[#1a2233] overflow-hidden">
      <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide px-4 py-1.5 min-h-[2rem]">

        {/* Index quotes */}
        {indices.map(idx => {
          const up = (idx.change_pct ?? 0) >= 0
          return (
            <div
              key={idx.symbol}
              className="flex items-center gap-1.5 flex-shrink-0 pr-4 mr-3 border-r border-[#1f2937] last:border-0 last:pr-0 last:mr-0"
            >
              <span className="text-[11px] text-gray-400 font-medium">{idx.name}</span>
              <span className="text-[11px] text-white font-mono">
                {idx.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-[11px] font-mono ${up ? 'text-green-400' : 'text-red-400'}`}>
                {up ? '+' : ''}{idx.change_pct?.toFixed(2)}%
              </span>
            </div>
          )
        })}

        {/* Divider */}
        {fg && indices.length > 0 && (
          <div className="w-px h-4 bg-[#1f2937] flex-shrink-0 mx-3" />
        )}

        {/* Fear & Greed */}
        {fg && (() => {
          const { text, bar } = fgColor(fg.rating)
          const pct = Math.min(100, Math.max(0, fg.score))
          return (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-gray-500">Fear &amp; Greed</span>
              {/* mini progress bar */}
              <div className="w-20 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-[11px] font-semibold ${text}`}>{fg.score}</span>
              <span className={`text-[10px] ${text} opacity-80`}>{fg.rating}</span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
