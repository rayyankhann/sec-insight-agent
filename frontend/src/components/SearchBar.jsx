/**
 * SearchBar.jsx — Fixed bottom input bar for sending messages.
 *
 * Features:
 * - Auto-resizing textarea (grows up to ~4 lines, then scrolls)
 * - Send on Enter key (Shift+Enter inserts a newline)
 * - Disabled state while the agent is loading
 * - Submit button with loading spinner when active
 *
 * The component is purely controlled — it calls onSend() with the message
 * string and doesn't manage any external state itself.
 */

import React, { useState, useRef, useCallback } from 'react'

/**
 * @param {Object}   props
 * @param {Function} props.onSend    - Callback invoked with the message string when sent
 * @param {boolean}  props.isLoading - Disables the input while the agent is processing
 */
function SearchBar({ onSend, isLoading }) {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef(null)

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    onSend(trimmed)
    setInputValue('')

    // Reset the textarea height after clearing the value
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputValue, isLoading, onSend])

  const handleKeyDown = (e) => {
    // Send on Enter, but allow Shift+Enter for newlines
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e) => {
    setInputValue(e.target.value)

    // Auto-resize: shrink back to auto first so the height recalculates correctly
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }

  const canSend = inputValue.trim().length > 0 && !isLoading

  return (
    <div className="border-t border-[#1f2937] bg-[#111827] px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div className={`
          flex items-end gap-3 rounded-2xl border px-4 py-3 transition-colors
          ${isLoading
            ? 'border-[#1f2937] bg-[#1a2233] opacity-75'
            : 'border-[#2d3748] bg-[#1a2233] focus-within:border-blue-600'
          }
        `}>
          {/* Textarea input */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask about any public company's SEC filings..."
            rows={1}
            className={`
              flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500
              resize-none outline-none leading-relaxed
              disabled:cursor-not-allowed
            `}
            style={{ maxHeight: '120px' }}
            aria-label="Message input"
          />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={`
              flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center
              transition-all duration-150 shadow-md
              ${canSend
                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer scale-100 hover:scale-105'
                : 'bg-[#1f2937] text-gray-600 cursor-not-allowed'
              }
            `}
            aria-label="Send message"
          >
            {isLoading ? (
              /* Spinner shown on the button while loading */
              <svg
                className="w-4 h-4 animate-spin text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              /* Send arrow icon */
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>

        {/* Helper text below the input */}
        <p className="text-center text-xs text-gray-600 mt-2">
          Answers sourced from live SEC EDGAR filings · Press Enter to send
        </p>
      </div>
    </div>
  )
}

export default SearchBar
