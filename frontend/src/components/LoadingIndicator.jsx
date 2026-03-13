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
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md"
        style={{ background: 'linear-gradient(135deg, #2d6fd4 0%, #1d4fa8 100%)', boxShadow: '0 0 14px rgba(45,111,212,0.35)' }}>
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
      <div
        className="rounded-3xl rounded-tl-sm px-5 py-4 shadow-lg"
        style={{
          background:
            'radial-gradient(circle at top, rgba(59,130,246,0.22), transparent 55%), rgba(5,8,21,0.96)',
          border: '1px solid var(--border-base)',
          boxShadow: '0 22px 70px rgba(0,0,0,0.9)',
        }}
      >
        <div className="flex items-center gap-1.5" aria-label="Loading response...">
          <span className="loading-dot w-2 h-2 rounded-full block" style={{ background: 'var(--blue)' }} />
          <span className="loading-dot w-2 h-2 rounded-full block" style={{ background: 'var(--blue)' }} />
          <span className="loading-dot w-2 h-2 rounded-full block" style={{ background: 'var(--blue)' }} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Searching SEC filings…</p>
      </div>
    </div>
  )
}

export default LoadingIndicator
