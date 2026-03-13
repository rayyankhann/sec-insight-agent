/**
 * App.jsx — Root application component for SEC Insight Agent.
 *
 * Layout switches between single-column (no company selected) and
 * two-column (company dashboard slides in on the right) when the agent
 * identifies a company in its response.
 *
 * ┌──────────────────────────────────────────────────┐
 * │                   Header Bar                     │
 * ├──────────────────────────────────┬───────────────┤
 * │                                  │               │
 * │          Chat Window             │   Company     │
 * │                                  │   Dashboard   │
 * ├──────────────────────────────────┤   (slides in) │
 * │           Search Bar             │               │
 * └──────────────────────────────────┴───────────────┘
 */

import React, { useState, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import SearchBar from './components/SearchBar'
import CompanyDashboard from './components/CompanyDashboard'
import EconomicCalendar from './components/EconomicCalendar'
import MarketBar from './components/MarketBar'
import Watchlist from './components/Watchlist'
import HomeScreen from './components/HomeScreen'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Generate 3 context-aware follow-up suggestions based on the agent response
function getFollowUpSuggestions(content, companyName, ticker) {
  if (!companyName && !ticker) return []
  const name = companyName || ticker
  const text = (content || '').toLowerCase()
  const pool = []

  if (text.includes('10-k') || text.includes('annual report')) {
    pool.push(`What were ${name}'s biggest risk factors?`)
    pool.push(`How did ${name}'s revenue change year over year?`)
    pool.push(`What did ${name} say about their future outlook?`)
  }
  if (text.includes('10-q') || text.includes('quarter')) {
    pool.push(`What was ${name}'s EPS this quarter?`)
    pool.push(`Did ${name} revise their annual guidance?`)
  }
  if (text.includes('8-k')) {
    pool.push(`Show me ${name}'s most recent 10-K`)
    pool.push(`What were ${name}'s latest quarterly earnings?`)
  }
  if (text.includes('revenue') || text.includes('earnings') || text.includes('profit')) {
    pool.push(`What's ${name}'s total debt situation?`)
    pool.push(`Did ${name} mention any upcoming risks?`)
  }
  if (text.includes('risk')) {
    pool.push(`How did ${name}'s revenue grow last year?`)
    pool.push(`Who are ${name}'s main competitors?`)
  }

  // Always include fallbacks
  pool.push(`What's ${name}'s business overview?`)
  pool.push(`Show ${name}'s most recent 8-K filings`)
  pool.push(`What risks did ${name} disclose in their last filing?`)

  const seen = new Set()
  const result = []
  for (const s of pool) {
    if (!seen.has(s) && result.length < 3) { seen.add(s); result.push(s) }
  }
  return result
}

function App() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  // Active company — persists even when dashboard is closed
  const [activeCompany, setActiveCompany] = useState(null)
  // { cik, ticker, name }

  // Controls whether the right-panel is visible (independent of activeCompany)
  const [dashboardOpen, setDashboardOpen] = useState(false)

  // Economic calendar overlay
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Watchlist panel
  const [watchlistOpen, setWatchlistOpen] = useState(false)

  const handleSend = useCallback(async (userMessage) => {
    const updatedMessages = [
      ...messages,
      { role: 'user', content: userMessage, sources: [] },
    ]
    setMessages(updatedMessages)
    setIsLoading(true)

    try {
      const history = updatedMessages
        .slice(0, -1)
        .map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }))

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, conversation_history: history }),
      })

      if (!response.ok) {
        let errorDetail = `Request failed with status ${response.status}`
        try {
          const errorData = await response.json()
          errorDetail = errorData.detail || errorDetail
        } catch { /* ignore */ }
        throw new Error(errorDetail)
      }

      const data = await response.json()

      const agentMsg = {
        role: 'agent',
        content: data.response,
        sources: data.sources || [],
        company_ticker: data.company_ticker || null,
        company_name: data.company_name || null,
        company_cik: data.company_cik || null,
        suggestions: getFollowUpSuggestions(data.response, data.company_name, data.company_ticker),
      }
      setMessages((prev) => [...prev, agentMsg])

      // Persist minimal \"last session\" context for HomeScreen resume banner
      try {
        const lastSession = {
          query: userMessage,
          company_ticker: data.company_ticker || null,
          company_name: data.company_name || null,
          company_cik: data.company_cik || null,
          timestamp: Date.now(),
        }
        window.localStorage.setItem('sec_insight_last_session', JSON.stringify(lastSession))
      } catch {
        // Ignore storage errors (e.g., Safari private mode)
      }

      // Open / update the sidebar dashboard when a company is identified
      if (data.company_cik) {
        setActiveCompany({
          cik: data.company_cik,
          ticker: data.company_ticker,
          name: data.company_name,
        })
        setDashboardOpen(true)
      }
    } catch (error) {
      const isNetworkError = error.message.includes('fetch') || error.message.includes('Failed to fetch')
      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          content: isNetworkError
            ? 'Unable to connect to the agent backend. Please make sure the server is running on port 8000.'
            : `Something went wrong: ${error.message}`,
          sources: [],
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [messages])

  const hasDashboard = !!activeCompany && dashboardOpen

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Left sidebar — BeeBot-style navigation */}
      <Sidebar
        onSend={handleSend}
        onOpenCalendar={() => setCalendarOpen(true)}
        onToggleWatchlist={() => {
          setWatchlistOpen(v => !v)
          if (dashboardOpen) setDashboardOpen(false)
        }}
      />

      {/* Main column: header, market bar, chat/dashboard */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* ─── Header Bar ────────────────────────────────────────────────── */}
        <header
          className="flex-shrink-0 z-10"
          style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between px-5 h-14">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)',
                  boxShadow: '0 0 18px rgba(59,130,246,0.55)',
                }}
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div>
                <h1
                  className="font-semibold text-sm tracking-tight"
                  style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
                >
                  SEC Insight
                </h1>
                <p
                  className="text-xs"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    marginTop: '-1px',
                  }}
                >
                  AI-powered filings research
                </p>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              {/* Active company pill */}
              {activeCompany && (
                <button
                  onClick={() => setDashboardOpen(v => !v)}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 transition-all duration-150"
                  style={{
                    color: dashboardOpen ? '#79b8ff' : 'var(--text-secondary)',
                    background: dashboardOpen ? 'rgba(64,144,232,0.12)' : 'transparent',
                    border: `1px solid ${
                      dashboardOpen ? 'rgba(64,144,232,0.35)' : 'var(--border-base)'
                    }`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#4090e8' }}
                  />
                  {activeCompany.ticker || activeCompany.name}
                  <svg
                    className={`w-3 h-3 transition-transform ${dashboardOpen ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}

              {/* Calendar quick toggle */}
              <button
                onClick={() => setCalendarOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 transition-all duration-150"
                style={{
                  color: calendarOpen ? '#a78bfa' : 'var(--text-secondary)',
                  background: calendarOpen ? 'rgba(167,139,250,0.08)' : 'transparent',
                  border: `1px solid ${
                    calendarOpen ? 'rgba(167,139,250,0.3)' : 'var(--border-base)'
                  }`,
                }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="hidden sm:inline">Calendar</span>
              </button>

              {/* Live indicator */}
              <div
                className="hidden sm:flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5"
                style={{
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span style={{ fontSize: '11px' }}>EDGAR Live</span>
              </div>
            </div>
          </div>
        </header>

        {/* ─── Market Bar ─────────────────────────────────────────────────── */}
        <MarketBar />

        {/* ─── Main Body (two-column when dashboard/watchlist is open) ────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Chat panel (or home screen when no messages) */}
          <div
            className="flex flex-col flex-1 min-w-0 transition-all duration-300"
            style={
              hasDashboard || watchlistOpen
                ? { borderRight: '1px solid var(--border-subtle)' }
                : {}
            }
          >
            {messages.length === 0 ? (
              <HomeScreen onSend={handleSend} isLoading={isLoading} />
            ) : (
              <ChatWindow
                messages={messages}
                isLoading={isLoading}
                onSuggestionClick={handleSend}
              />
            )}
            {messages.length > 0 && (
              <SearchBar onSend={handleSend} isLoading={isLoading} />
            )}
          </div>

          {/* Right: Company Dashboard — slides in when a company is identified */}
          {hasDashboard && !watchlistOpen && (
            <div className="w-80 flex-shrink-0 flex flex-col">
              <CompanyDashboard
                companyName={activeCompany.name}
                ticker={activeCompany.ticker}
                cik={activeCompany.cik}
                onClose={() => setDashboardOpen(false)}
                onSummarize={handleSend}
              />
            </div>
          )}

          {/* Right: Watchlist panel */}
          {watchlistOpen && (
            <div className="w-72 flex-shrink-0 flex flex-col">
              <Watchlist
                onClose={() => setWatchlistOpen(false)}
                onAsk={ticker =>
                  handleSend(
                    `What are the biggest risks mentioned in ${ticker}'s latest 10-K?`,
                  )
                }
              />
            </div>
          )}
        </div>

        {/* ─── Economic Calendar overlay ──────────────────────────────────── */}
        {calendarOpen && <EconomicCalendar onClose={() => setCalendarOpen(false)} />}
      </div>
    </div>
  )
}

function Sidebar({ onSend, onOpenCalendar, onToggleWatchlist }) {
  const quickPrompts = [
    "Summarize Tesla's latest 10-K in plain English.",
    "What were Apple's key risks in their most recent annual report?",
    "Show me NVIDIA's most recent 8-K filings.",
  ]

  return (
    <aside
      className="hidden md:flex flex-col w-64 border-r"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <p
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-muted)' }}
        >
          Navigation
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Primary nav */}
        <nav className="space-y-1 text-sm">
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: 'var(--bg-interactive)',
              border: '1px solid var(--border-base)',
            }}
          >
            <span>🏠</span>
            <span style={{ color: 'var(--text-primary)' }}>Home</span>
          </div>

          <button
            type="button"
            onClick={onOpenCalendar}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>📅</span>
            <span>Economic Calendar</span>
          </button>

          <button
            type="button"
            onClick={onToggleWatchlist}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>⭐</span>
            <span>Watchlist</span>
          </button>
        </nav>

        {/* Quick prompts */}
        <div className="space-y-2">
          <p
            className="text-[11px] font-medium uppercase tracking-[0.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Quick Starts
          </p>
          <div className="space-y-2">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSend(q)}
                className="w-full text-left rounded-lg px-3 py-2 text-xs transition-colors"
                style={{
                  background: 'var(--bg-interactive)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

export default App
