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

function App() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  // Active company shown in the right-panel dashboard
  const [activeCompany, setActiveCompany] = useState(null)
  // { cik, ticker, name }

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

      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: data.response,
          sources: data.sources || [],
          // Attach company metadata so MessageBubble can render the inline stock chart
          company_ticker: data.company_ticker || null,
          company_name: data.company_name || null,
          company_cik: data.company_cik || null,
        },
      ])

      // Open the sidebar dashboard (Financials + Filings tabs) when a company is found
      if (data.company_cik) {
        setActiveCompany({
          cik: data.company_cik,
          ticker: data.company_ticker,
          name: data.company_name,
        })
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

  const hasDashboard = !!activeCompany

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
            {/* Show active company badge in header when dashboard is open */}
            {activeCompany && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-300 bg-[#1a2233] border border-[#1f2937] rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {activeCompany.ticker || activeCompany.name}
              </div>
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
          <ChatWindow messages={messages} isLoading={isLoading} />
          <SearchBar onSend={handleSend} isLoading={isLoading} />
        </div>

        {/* Right: Company Dashboard — slides in when a company is identified */}
        {hasDashboard && (
          <div className="w-80 flex-shrink-0 flex flex-col">
            <CompanyDashboard
              companyName={activeCompany.name}
              ticker={activeCompany.ticker}
              cik={activeCompany.cik}
              onClose={() => setActiveCompany(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
