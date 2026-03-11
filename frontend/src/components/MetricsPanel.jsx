/**
 * MetricsPanel.jsx — Key financial metrics from EDGAR XBRL data.
 *
 * 2-column layout with clear hierarchy: label → value → YoY change.
 * Data from EDGAR's free XBRL Company Facts API — no LLM call needed.
 */

import React, { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_MCP_URL ?? '/mcp'

const METRIC_PRIORITY = [
  'Revenue', 'Net Income', 'Gross Profit',
  'Operating Income', 'EPS (Basic)', 'Total Assets',
  'Cash & Equivalents', 'Long-Term Debt', 'Stockholders Equity',
]

function formatValue(value, unit) {
  if (value === null || value === undefined) return '—'
  if (unit === 'USD/share') return `$${value.toFixed(2)}`

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function yoyChange(current, prior) {
  if (!prior || prior === 0 || current === null) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

function MetricRow({ metric }) {
  const change = yoyChange(metric.value, metric.prior_value)
  const isPositive = change !== null && change >= 0
  const year = metric.period ? metric.period.slice(0, 4) : ''

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1a2233] last:border-0">
      {/* Label + period */}
      <div className="min-w-0 pr-2">
        <p className="text-gray-400 text-xs truncate">{metric.label}</p>
        {year && <p className="text-gray-600 text-xs">FY{year}</p>}
      </div>

      {/* Value + YoY */}
      <div className="text-right flex-shrink-0">
        <p className="text-white font-semibold text-sm">
          {formatValue(metric.value, metric.unit)}
        </p>
        {change !== null && (
          <p className={`text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </p>
        )}
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
        const sorted = [...(json.metrics || [])].sort((a, b) => {
          const ai = METRIC_PRIORITY.indexOf(a.label)
          const bi = METRIC_PRIORITY.indexOf(b.label)
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        })
        setMetrics(sorted.slice(0, 8))
        setLoading(false)
      })
      .catch(() => {
        setError('Financial data unavailable')
        setLoading(false)
      })
  }, [cik])

  if (loading) {
    return (
      <div className="space-y-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex justify-between py-2.5 border-b border-[#1a2233] animate-pulse">
            <div className="h-3 bg-[#1f2937] rounded w-1/3" />
            <div className="h-3 bg-[#1f2937] rounded w-1/4" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !metrics.length) {
    return (
      <p className="text-gray-500 text-sm text-center py-6">
        {error || 'No financial data available'}
      </p>
    )
  }

  return (
    <div>
      {/* Column headers */}
      <div className="flex justify-between pb-1 mb-1 border-b border-[#1f2937]">
        <span className="text-xs text-gray-600 uppercase tracking-wide">Metric</span>
        <span className="text-xs text-gray-600 uppercase tracking-wide">Value · YoY</span>
      </div>
      {metrics.map((metric, i) => (
        <MetricRow key={i} metric={metric} />
      ))}
      <p className="text-xs text-gray-600 mt-3 text-center">Annual · EDGAR XBRL</p>
    </div>
  )
}

export default MetricsPanel
