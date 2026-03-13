/**
 * CompanyDashboard.jsx — Right-panel company research dashboard.
 * Premium dark theme with icon tabs.
 */
import React, { useState } from 'react'
import MetricsPanel from './MetricsPanel'
import FilingTimeline from './FilingTimeline'
import NewsCard from './NewsCard'
import InsiderTrading from './InsiderTrading'
import CongressionalTrading from './CongressionalTrading'
import OptionsFlow from './OptionsFlow'
import InstitutionalHoldings from './InstitutionalHoldings'

const TABS = [
  {
    id: 'metrics',
    label: 'Financials',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'timeline',
    label: 'Filings',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'news',
    label: 'News',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    id: 'insiders',
    label: 'Insiders',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'options',
    label: 'Options',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    id: 'holders',
    label: 'Holders',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'congress',
    label: 'Congress',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
  },
]

function CompanyDashboard({ companyName, ticker, cik, onClose, onSummarize }) {
  const [activeTab, setActiveTab] = useState('metrics')

  return (
    <div className="flex flex-col h-full animate-fade-in"
      style={{
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
      }}>

      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>

        {/* Company name row */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-sm truncate leading-snug"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {companyName}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {ticker && (
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md"
                  style={{
                    color: 'var(--blue-hover)',
                    background: 'rgba(64,144,232,0.1)',
                    border: '1px solid rgba(64,144,232,0.2)',
                  }}>
                  {ticker}
                </span>
              )}
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                CIK {cik?.replace(/^0+/, '')}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 ml-2 w-6 h-6 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar — underline style */}
        <div className="flex gap-0.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-t-md flex-shrink-0 transition-all duration-150 relative"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}>
                <span style={{ opacity: isActive ? 1 : 0.6 }}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Tab Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {activeTab === 'metrics' && <MetricsPanel cik={cik} />}

        {activeTab === 'timeline' && <FilingTimeline cik={cik} />}

        {activeTab === 'news' && (
          ticker
            ? <NewsCard ticker={ticker} onSummarize={onSummarize} />
            : <EmptyState msg="No ticker available." />
        )}

        {activeTab === 'insiders' && <InsiderTrading cik={cik} />}

        {activeTab === 'options' && (
          ticker
            ? <OptionsFlow ticker={ticker} />
            : <EmptyState msg="No ticker available." />
        )}

        {activeTab === 'holders' && (
          ticker
            ? <InstitutionalHoldings ticker={ticker} />
            : <EmptyState msg="No ticker available." />
        )}

        {activeTab === 'congress' && (
          ticker
            ? <CongressionalTrading ticker={ticker} />
            : <EmptyState msg="No ticker available." />
        )}
      </div>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-center" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
          SEC EDGAR · Yahoo Finance · Congress · Live data
        </p>
      </div>
    </div>
  )
}

function EmptyState({ msg }) {
  return (
    <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>{msg}</p>
  )
}

export default CompanyDashboard
