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
    <div className="flex flex-col h-screen bg-[#0a0f1e]">

      {/* ─── Header Bar ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-[#1f2937] bg-[#111827] px-6 py-4 z-10">
        <div className="flex items-center justify-between max-w-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg leading-none">SEC Insight Agent</h1>
              <p className="text-gray-500 text-xs mt-0.5">Real-time answers from SEC filings</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Company pill — clickable to toggle the dashboard panel */}
            {activeCompany && (
              <button
                onClick={() => setDashboardOpen(v => !v)}
                title={dashboardOpen ? 'Hide dashboard' : 'Show dashboard'}
                className="hidden sm:flex items-center gap-2 text-xs text-gray-300 bg-[#1a2233] border border-[#1f2937] rounded-full px-3 py-1.5 hover:border-blue-700 hover:text-blue-300 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {activeCompany.ticker || activeCompany.name}
                {/* chevron flips direction based on panel state */}
                <svg
                  className={`w-3 h-3 opacity-60 transition-transform ${dashboardOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-[#1a2233] border border-[#1f2937] rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              SEC EDGAR Live
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main Body (two-column when dashboard is open) ───────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Chat panel */}
        <div className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${hasDashboard ? 'border-r border-[#1f2937]' : ''}`}>
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            onSuggestionClick={handleSend}
          />
          <SearchBar onSend={handleSend} isLoading={isLoading} />
        </div>

        {/* Right: Company Dashboard — slides in when a company is identified */}
        {hasDashboard && (
          <div className="w-80 flex-shrink-0 flex flex-col">
            <CompanyDashboard
              companyName={activeCompany.name}
              ticker={activeCompany.ticker}
              cik={activeCompany.cik}
              onClose={() => setDashboardOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
