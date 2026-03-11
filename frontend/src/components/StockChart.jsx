/**
 * StockChart.jsx — 1-year weekly stock price chart using Recharts.
 *
 * Fetches historical price data from the MCP server (/stock/{ticker}/chart)
 * which proxies Yahoo Finance. No API key required, completely free.
 *
 * Shows:
 * - Area chart of weekly closing prices over the past year
 * - Current price and % change from 1 year ago
 * - Color-coded green/red based on performance
 */

import React, { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const API_BASE = import.meta.env.VITE_MCP_URL ?? '/mcp'

// Format large dollar numbers concisely: 182.50 → $182.50
function formatPrice(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Shorten month labels for x-axis: "2024-03-11" → "Mar"
function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

// Custom tooltip shown on hover
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = new Date(label + 'T00:00:00Z')
  const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return (
    <div className="bg-[#1a2233] border border-[#2d3748] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-gray-400 mb-1">{dateLabel}</p>
      <p className="text-white font-semibold">{formatPrice(payload[0].value)}</p>
    </div>
  )
}

function StockChart({ ticker }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/stock/${ticker}/chart?range=1y`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => {
        setData(json.data || [])
        setLoading(false)
      })
      .catch(() => {
        setError('Price data unavailable')
        setLoading(false)
      })
  }, [ticker])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-36">
        <div className="flex gap-1">
          <span className="loading-dot w-1.5 h-1.5 rounded-full bg-blue-400 block" />
          <span className="loading-dot w-1.5 h-1.5 rounded-full bg-blue-400 block" />
          <span className="loading-dot w-1.5 h-1.5 rounded-full bg-blue-400 block" />
        </div>
      </div>
    )
  }

  if (error || !data.length) {
    return (
      <div className="flex items-center justify-center h-36 text-gray-500 text-sm">
        {error || 'No price data available'}
      </div>
    )
  }

  const firstPrice = data[0].close
  const lastPrice = data[data.length - 1].close
  const change = lastPrice - firstPrice
  const changePct = ((change / firstPrice) * 100).toFixed(2)
  const isPositive = change >= 0

  // Thin out x-axis labels — show one per month
  const seenMonths = new Set()
  const xTicks = data
    .filter(d => {
      const m = d.date.slice(0, 7) // "2024-03"
      if (seenMonths.has(m)) return false
      seenMonths.add(m)
      return true
    })
    .map(d => d.date)

  const chartColor = isPositive ? '#22c55e' : '#ef4444'
  const gradientId = `gradient-${ticker}`

  return (
    <div>
      {/* Price header */}
      <div className="flex items-baseline gap-3 mb-3 px-1">
        <span className="text-2xl font-bold text-white">{formatPrice(lastPrice)}</span>
        <span className={`text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{changePct}% (1Y)
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={xTicks}
            tickFormatter={shortDate}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={v => `$${v.toFixed(0)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="close"
            stroke={chartColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: chartColor, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default StockChart
