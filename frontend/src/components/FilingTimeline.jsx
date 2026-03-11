/**
 * FilingTimeline.jsx — Visual timeline of a company's recent SEC filings.
 *
 * Fetches combined 10-K/10-Q/8-K filing history from the MCP server
 * (/company/{cik}/timeline). Each filing is a clickable dot that opens
 * the document on SEC.gov in a new tab.
 *
 * Color coding:
 *   10-K (annual)  → blue
 *   10-Q (quarterly) → purple
 *   8-K (current events) → amber
 */

import React, { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_MCP_URL ?? '/mcp'

const TYPE_STYLES = {
  '10-K': {
    dot: 'bg-blue-500 border-blue-400',
    badge: 'bg-blue-950 text-blue-300 border-blue-800',
    label: 'Annual',
  },
  '10-Q': {
    dot: 'bg-purple-500 border-purple-400',
    badge: 'bg-purple-950 text-purple-300 border-purple-800',
    label: 'Quarterly',
  },
  '8-K': {
    dot: 'bg-amber-500 border-amber-400',
    badge: 'bg-amber-950 text-amber-300 border-amber-800',
    label: 'Current',
  },
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function FilingTimeline({ cik }) {
  const [filings, setFilings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!cik) return
    setLoading(true)

    fetch(`${API_BASE}/company/${cik}/timeline`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => {
        setFilings(json.filings || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [cik])

  const filtered = filter === 'all' ? filings : filings.filter(f => f.form_type === filter)
  const displayed = filtered.slice(0, 10)

  const filterBtn = (type, label) => (
    <button
      onClick={() => setFilter(type)}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        filter === type
          ? 'bg-[#1f2937] border-[#374151] text-white'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-3 h-3 rounded-full bg-[#1f2937] flex-shrink-0" />
            <div className="flex-1 h-3 bg-[#1f2937] rounded" />
            <div className="w-16 h-3 bg-[#1f2937] rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!filings.length) {
    return <p className="text-gray-500 text-sm text-center py-4">No filing history available</p>
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {filterBtn('all', 'All')}
        {filterBtn('10-K', '10-K')}
        {filterBtn('10-Q', '10-Q')}
        {filterBtn('8-K', '8-K')}
      </div>

      {/* Timeline list */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[#1f2937]" />

        <div className="space-y-2.5">
          {displayed.map((filing, i) => {
            const style = TYPE_STYLES[filing.form_type] || TYPE_STYLES['8-K']
            return (
              <a
                key={i}
                href={filing.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 group"
              >
                {/* Timeline dot */}
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 z-10 transition-transform group-hover:scale-125 ${style.dot}`} />

                {/* Filing info */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${style.badge}`}>
                    {filing.form_type}
                  </span>
                  <span className="text-xs text-gray-400 truncate group-hover:text-gray-200 transition-colors">
                    {formatDate(filing.filed_date)}
                  </span>
                </div>

                {/* External link icon on hover */}
                <svg className="w-3 h-3 text-gray-600 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )
          })}
        </div>
      </div>

      {filtered.length > 10 && (
        <p className="text-xs text-gray-600 mt-3 text-center">Showing 10 of {filtered.length} filings</p>
      )}
    </div>
  )
}

export default FilingTimeline
