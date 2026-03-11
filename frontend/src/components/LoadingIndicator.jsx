/**
 * LoadingIndicator.jsx — Animated three-dot loading indicator.
 *
 * Shown as an agent "message" in the chat while waiting for the backend
 * to respond. Uses staggered CSS animations for a polished bouncing effect.
 * Styled to look like an agent message bubble so the transition to the
 * real response feels seamless.
 */

import React from 'react'

function LoadingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      {/* Agent avatar — matches the icon used in MessageBubble for agent messages */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg">
        <svg
          className="w-4 h-4 text-white"
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

      {/* Bubble containing the three animated dots */}
      <div className="bg-[#1a2233] border border-[#1f2937] rounded-2xl rounded-tl-sm px-5 py-4 shadow-lg">
        <div className="flex items-center gap-1.5" aria-label="Loading response...">
          <span className="loading-dot w-2 h-2 rounded-full bg-blue-400 block" />
          <span className="loading-dot w-2 h-2 rounded-full bg-blue-400 block" />
          <span className="loading-dot w-2 h-2 rounded-full bg-blue-400 block" />
        </div>
        <p className="text-xs text-gray-500 mt-2">Searching SEC filings...</p>
      </div>
    </div>
  )
}

export default LoadingIndicator
