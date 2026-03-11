/**
 * CompanyDashboard.jsx — Right-panel dashboard shown when a company is discussed.
 *
 * Slides in when the agent identifies a company, showing three sections:
 *   1. Stock price chart (1-year weekly, via Yahoo Finance proxy)
 *   2. Key financial metrics (from EDGAR XBRL structured data)
 *   3. Filing timeline (10-K / 10-Q / 8-K history, clickable links)
 *
 * All data is fetched from the MCP server — no extra LLM calls, no extra cost.
 */

import React, { useState } from 'react'
import StockChart from './StockChart'
import MetricsPanel from './MetricsPanel'
import FilingTimeline from './FilingTimeline'

const TABS = [
  { id: 'chart', label: 'Price' },
  { id: 'metrics', label: 'Financials' },
  { id: 'timeline', label: 'Filings' },
]

function CompanyDashboard({ companyName, ticker, cik, onClose }) {
  const [activeTab, setActiveTab] = useState('chart')

  return (
    <div className="flex flex-col h-full bg-[#0d1424] border-l border-[#1f2937] animate-fade-in-up">

      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1f2937] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-sm truncate">{companyName}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {ticker && (
                <span className="text-xs font-mono text-blue-400 bg-blue-950 border border-blue-900 rounded px-1.5 py-0.5">
                  {ticker}
                </span>
              )}
              <span className="text-xs text-gray-600">CIK {cik?.replace(/^0+/, '')}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-[#1f2937] transition-colors"
            aria-label="Close dashboard"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#1f2937] text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab Content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {activeTab === 'chart' && (
          <div>
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
              1-Year Price History
            </p>
            {ticker ? (
              <StockChart ticker={ticker} />
            ) : (
              <p className="text-gray-500 text-sm text-center py-8">
                No ticker symbol available for this company
              </p>
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div>
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
              Annual Financials · EDGAR XBRL
            </p>
            <MetricsPanel cik={cik} />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div>
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">
              Filing History · Click to open on SEC.gov
            </p>
            <FilingTimeline cik={cik} />
          </div>
        )}
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[#1f2937] px-4 py-2">
        <p className="text-xs text-gray-600 text-center">
          Data: SEC EDGAR · Yahoo Finance · Updated live
        </p>
      </div>
    </div>
  )
}

export default CompanyDashboard
