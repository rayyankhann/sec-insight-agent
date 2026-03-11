/**
 * App.jsx — Root application component for SEC Insight Agent.
 *
 * Manages all application state:
 * - messages: array of { role, content, sources } objects (the full chat history)
 * - isLoading: boolean flag while waiting for the agent backend to respond
 *
 * Renders the three-section layout:
 * ┌─────────────────────────────┐
 * │         Header Bar          │  ← fixed top
 * ├─────────────────────────────┤
 * │                             │
 * │        Chat Window          │  ← scrollable, fills remaining height
 * │                             │
 * ├─────────────────────────────┤
 * │        Search Bar           │  ← fixed bottom
 * └─────────────────────────────┘
 *
 * API calls go to /api/chat which Vite proxies to the agent backend at :8000 in dev.
 * In production (Railway/Vercel), VITE_API_URL is set to the deployed agent backend URL.
 */

import React, { useState, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import SearchBar from './components/SearchBar'

// In local dev: Vite proxies /api → http://localhost:8000 (see vite.config.js)
// In production: set VITE_API_URL to the deployed Railway agent backend URL,
//   e.g. https://sec-agent-backend-production.up.railway.app
const API_BASE = import.meta.env.VITE_API_URL || '/api'

function App() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSend = useCallback(async (userMessage) => {
    // 1. Add the user's message to the chat immediately (optimistic update)
    const updatedMessages = [
      ...messages,
      { role: 'user', content: userMessage, sources: [] },
    ]
    setMessages(updatedMessages)
    setIsLoading(true)

    try {
      // 2. Build the conversation history for the backend.
      //    We exclude the last message (the one we just added) since it's
      //    passed separately in the "message" field. The history provides
      //    context for multi-turn conversations.
      const history = updatedMessages
        .slice(0, -1) // All messages except the one just added
        .map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }))

      // 3. Call the agent backend
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversation_history: history,
        }),
      })

      if (!response.ok) {
        // Try to extract a meaningful error message from the response body
        let errorDetail = `Request failed with status ${response.status}`
        try {
          const errorData = await response.json()
          errorDetail = errorData.detail || errorDetail
        } catch {
          // Couldn't parse JSON error — use the default message
        }
        throw new Error(errorDetail)
      }

      const data = await response.json()

      // 4. Add the agent's response to the chat
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: data.response,
          sources: data.sources || [],
        },
      ])
    } catch (error) {
      // 5. On error, show a friendly error message in the chat
      const isNetworkError = error.message.includes('fetch') || error.message.includes('Failed to fetch')
      const userFriendlyMessage = isNetworkError
        ? 'Unable to connect to the agent backend. Please make sure the server is running on port 8000.'
        : `Something went wrong: ${error.message}`

      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          content: userFriendlyMessage,
          sources: [],
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [messages])

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1e]">
      {/* ─── Header Bar ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-[#1f2937] bg-[#111827] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            {/* Chart icon representing financial data analysis */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
              <h1 className="text-white font-semibold text-lg leading-none">
                SEC Insight Agent
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Real-time answers from SEC filings
              </p>
            </div>
          </div>

          {/* Live indicator badge */}
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-[#1a2233] border border-[#1f2937] rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            SEC EDGAR Live
          </div>
        </div>
      </header>

      {/* ─── Chat Window ─────────────────────────────────────────────────── */}
      <ChatWindow messages={messages} isLoading={isLoading} />

      {/* ─── Search Bar ──────────────────────────────────────────────────── */}
      <SearchBar onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}

export default App
