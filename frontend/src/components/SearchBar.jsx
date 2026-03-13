/**
 * SearchBar.jsx — Premium command-palette style input bar.
 */
import React, { useState, useRef, useCallback } from 'react'

function SearchBar({ onSend, isLoading }) {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef(null)

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputValue, isLoading, onSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e) => {
    setInputValue(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }

  const canSend = inputValue.trim().length > 0 && !isLoading

  return (
    <div className="flex-shrink-0 px-4 py-3" style={{
      background: 'var(--bg-elevated)',
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <div className="max-w-3xl mx-auto">
        {/* Input container */}
        <div
          className="flex items-end gap-3 rounded-xl px-4 py-3 transition-all duration-200"
          style={{
            background: 'var(--bg-interactive)',
            border: isLoading
              ? '1px solid var(--border-subtle)'
              : '1px solid var(--border-base)',
            boxShadow: canSend ? '0 0 0 1px rgba(64,144,232,0.2), 0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.2)',
          }}
          onFocus={() => {}} /* handled via CSS */
        >
          {/* Search icon */}
          <svg className="w-4 h-4 flex-shrink-0 mb-0.5 transition-colors"
            style={{ color: inputValue ? 'var(--blue)' : 'var(--text-muted)' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask about any public company's SEC filings…"
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none leading-relaxed disabled:cursor-not-allowed"
            style={{
              color: 'var(--text-primary)',
              caretColor: 'var(--blue)',
              maxHeight: '120px',
              fontFamily: 'inherit',
            }}
          />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
            style={{
              background: canSend ? 'var(--blue)' : 'var(--bg-hover)',
              color: canSend ? '#fff' : 'var(--text-muted)',
              boxShadow: canSend ? '0 2px 12px rgba(64,144,232,0.4)' : 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
              transform: canSend ? 'scale(1)' : 'scale(0.95)',
            }}
          >
            {isLoading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-center mt-1.5" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
          Powered by SEC EDGAR · Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

export default SearchBar
