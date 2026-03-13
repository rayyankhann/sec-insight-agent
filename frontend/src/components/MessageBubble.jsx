/**
 * MessageBubble.jsx — Premium chat message rendering.
 */
import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import StockCard from './StockCard'

function MessageBubble({ role, content, sources = [], company_ticker, company_name, suggestions = [], isLatest = false, onSuggestionClick }) {
  const isUser  = role === 'user'
  const isError = role === 'error'

  /* ── User bubble ────────────────────────────────────────────── */
  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="flex items-end gap-2 max-w-[78%]">
          <div
            className="rounded-3xl rounded-br-sm px-4 py-3 shadow-lg"
            style={{
              background:
                'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.95))',
              border: '1px solid rgba(191,219,254,0.5)',
              boxShadow: '0 20px 60px rgba(15,23,42,0.9)',
            }}
          >
            <p className="text-sm leading-relaxed text-white whitespace-pre-wrap">
              {content}
            </p>
          </div>
          {/* Avatar */}
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-base)' }}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"
              style={{ color: 'var(--text-secondary)' }}>
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  /* ── Error bubble ───────────────────────────────────────────── */
  if (isError) {
    return (
      <div className="flex items-start gap-3 animate-fade-in-up">
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            style={{ color: '#f87171' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div
          className="rounded-3xl rounded-tl-sm px-4 py-3 max-w-[85%]"
          style={{
            background:
              'radial-gradient(circle at top, rgba(248,113,113,0.18), transparent 55%), rgba(24,24,27,0.96)',
            border: '1px solid rgba(248,113,113,0.45)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.85)',
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: '#fecaca' }}>
            {content}
          </p>
        </div>
      </div>
    )
  }

  /* ── Agent bubble ───────────────────────────────────────────── */
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      {/* Agent avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 shadow-md"
        style={{
          background: 'linear-gradient(135deg, #2d6fd4 0%, #1d4fa8 100%)',
          boxShadow: '0 0 14px rgba(45,111,212,0.35)',
        }}>
        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>

      <div className="flex flex-col gap-2.5 max-w-[85%]">
        {/* Bubble */}
        <div
          className="rounded-3xl rounded-tl-sm px-5 py-4 shadow-lg"
          style={{
            background:
              'radial-gradient(circle at top, rgba(59,130,246,0.22), transparent 55%), rgba(5,8,21,0.96)',
            border: '1px solid var(--border-base)',
            boxShadow: '0 22px 70px rgba(0,0,0,0.9)',
          }}
        >
          <div className="prose-dark text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>

          {/* Inline stock card */}
          {company_ticker && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {company_name ? `${company_name} · ` : ''}{company_ticker}
                </p>
                <a href={`https://finance.yahoo.com/quote/${company_ticker}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs transition-colors hover:opacity-80"
                  style={{ color: 'var(--blue-hover)' }}>
                  Yahoo Finance
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <StockCard ticker={company_ticker} companyName={company_name} />
            </div>
          )}
        </div>

        {/* Follow-up suggestion chips */}
        {isLatest && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-0.5">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onSuggestionClick?.(s)}
                className="text-xs rounded-lg px-3 py-1.5 transition-all duration-150 text-left hover:scale-[1.02]"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-base)',
                }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Source badges */}
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-0.5">
            {sources.map((source, idx) => {
              const label = source.tool === 'get_filing_content'
                ? 'SEC Filing' : source.tool === 'get_filings'
                ? 'Filing List' : 'Company Search'
              const isLink = source.tool === 'get_filing_content' && source.url

              const badge = (
                <span className="inline-flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {label}
                  {isLink && (
                    <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </span>
              )

              const sharedStyle = {
                fontSize: '11px',
                padding: '3px 10px',
                borderRadius: '6px',
                color: 'var(--blue-hover)',
                background: 'rgba(64,144,232,0.08)',
                border: '1px solid rgba(64,144,232,0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }

              return isLink ? (
                <a key={idx} href={source.url} target="_blank" rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-80" style={sharedStyle}>
                  {badge}
                </a>
              ) : (
                <span key={idx} style={sharedStyle}>{badge}</span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
