/**
 * MetricsPanel.jsx — Key financial metrics cards from EDGAR XBRL data.
 *
 * Fetches structured annual financial data from the MCP server
 * (/company/{cik}/financials) which reads EDGAR's free XBRL Company Facts API.
 * No LLM call needed — this is pure structured data.
 *
 * Shows the 6 most important metrics with year-over-year comparison.
 */

import React, { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_MCP_URL || 'http://localhost:8001'

// Priority order for which metrics to show first
const METRIC_PRIORITY = [
  'Revenue', 'Net Income', 'Gross Profit',
  'Operating Income', 'EPS (Basic)', 'Total Assets',
  'Cash & Equivalents', 'Long-Term Debt', 'Stockholders Equity',
]

function formatValue(value, unit) {
  if (value === null || value === undefined) return '—'

  if (unit === 'USD/share') {
    return `$${value.toFixed(2)}`
  }

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function yoyChange(current, prior) {
  if (!prior || prior === 0 || current === null) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

function MetricCard({ metric }) {
  const change = yoyChange(metric.value, metric.prior_value)
  const isPositive = change !== null && change >= 0
  const year = metric.period ? metric.period.slice(0, 4) : ''

  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-3">
      <p className="text-gray-500 text-xs mb-1.5 truncate">{metric.label}</p>
      <p className="text-white font-bold text-base leading-tight">
        {formatValue(metric.value, metric.unit)}
      </p>
      <div className="flex items-center justify-between mt-1.5">
        {change !== null ? (
          <span className={`text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% YoY
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
        {year && <span className="text-xs text-gray-600">FY{year}</span>}
      </div>
    </div>
  )
}

function MetricsPanel({ cik }) {
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!cik) return
    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/company/${cik}/financials`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => {
        // Sort by priority order
        const sorted = [...(json.metrics || [])].sort((a, b) => {
          const ai = METRIC_PRIORITY.indexOf(a.label)
          const bi = METRIC_PRIORITY.indexOf(b.label)
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        })
        setMetrics(sorted.slice(0, 6))
        setLoading(false)
      })
      .catch(() => {
        setError('Financial data unavailable')
        setLoading(false)
      })
  }, [cik])

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-[#111827] border border-[#1f2937] rounded-xl p-3 animate-pulse">
            <div className="h-3 bg-[#1f2937] rounded mb-2 w-2/3" />
            <div className="h-5 bg-[#1f2937] rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !metrics.length) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        {error || 'No financial data available'}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {metrics.map((metric, i) => (
        <MetricCard key={i} metric={metric} />
      ))}
    </div>
  )
}

export default MetricsPanel
