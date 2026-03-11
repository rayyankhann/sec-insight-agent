/**
 * MessageBubble.jsx — Renders a single chat message.
 *
 * Handles two visual variants:
 * - "user"  → right-aligned, blue accent background, simple plain text
 * - "agent" → left-aligned, dark card background, markdown rendered via react-markdown
 *
 * Agent messages support full markdown including headers, bold, bullet lists,
 * and code blocks — all styled via the .prose-dark CSS class in index.css.
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import StockChart from './StockChart'

/**
 * @param {Object} props
 * @param {'user' | 'agent' | 'error'} props.role - Who sent the message
 * @param {string} props.content - The message text (markdown for agent)
 * @param {Array}  props.sources - Optional source citations from the agent
 * @param {string} [props.company_ticker] - Ticker symbol for inline stock chart
 * @param {string} [props.company_name]   - Company name shown above the chart
 */
function MessageBubble({ role, content, sources = [], company_ticker, company_name }) {
  const isUser = role === 'user'
  const isError = role === 'error'

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="flex items-end gap-2 max-w-[80%]">
          {/* User message bubble — right-aligned, blue accent */}
          <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-lg">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>

          {/* User avatar */}
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center shadow">
            <svg
              className="w-3.5 h-3.5 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 animate-fade-in-up">
        {/* Error icon avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-900 border border-red-700 flex items-center justify-center shadow-lg">
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Error bubble */}
        <div className="bg-red-950 border border-red-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg max-w-[85%]">
          <p className="text-red-300 text-sm leading-relaxed">{content}</p>
        </div>
      </div>
    )
  }

  // Agent message
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      {/* Agent avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg mt-0.5">
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

      <div className="flex flex-col gap-2 max-w-[85%]">
        {/* Agent message bubble with markdown rendering */}
        <div className="bg-[#1a2233] border border-[#1f2937] rounded-2xl rounded-tl-sm px-5 py-4 shadow-lg">
          <div className="prose-dark text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>

          {/* Inline stock chart — rendered when the agent identified a company with a ticker */}
          {company_ticker && (
            <div className="mt-4 pt-4 border-t border-[#1f2937]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {company_name ? `${company_name} · ` : ''}{company_ticker} · 1-Year Price
                </p>
                <a
                  href={`https://finance.yahoo.com/quote/${company_ticker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
                >
                  Yahoo Finance
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <StockChart ticker={company_ticker} />
            </div>
          )}
        </div>

        {/* Source citation badges — shown below the bubble for each tool the agent called.
            The "SEC Filing" badge is a real link to the document on SEC.gov when a URL is available. */}
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-1">
            {sources.map((source, idx) => {
              const label =
                source.tool === 'get_filing_content'
                  ? 'SEC Filing'
                  : source.tool === 'get_filings'
                  ? 'Filing List'
                  : 'Company Search'

              const isLink = source.tool === 'get_filing_content' && source.url

              const badgeClasses =
                'inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-950 border border-blue-900 rounded-full px-2.5 py-1 transition-colors ' +
                (isLink ? 'hover:bg-blue-900 hover:border-blue-700 hover:text-blue-300 cursor-pointer' : 'cursor-default')

              const icon = (
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )

              // External link icon — shown on the SEC Filing badge to signal it opens a new tab
              const externalIcon = (
                <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              )

              if (isLink) {
                return (
                  <a
                    key={idx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={badgeClasses}
                    title={`Open on SEC.gov: ${source.url}`}
                  >
                    {icon}
                    {label}
                    {externalIcon}
                  </a>
                )
              }

              return (
                <span
                  key={idx}
                  className={badgeClasses}
                  title={source.description}
                >
                  {icon}
                  {label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
