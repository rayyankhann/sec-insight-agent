/**
 * ChatWindow.jsx — Scrollable message history container.
 *
 * Responsibilities:
 * - Renders the list of all messages (user + agent + loading indicator)
 * - Auto-scrolls to the bottom whenever new messages are added
 * - Shows a welcome message when there are no messages yet
 *
 * The scroll behavior uses a ref pointing to a sentinel div at the bottom of the list.
 * When the messages array changes, a useEffect triggers smooth scrolling to the sentinel.
 */

import React, { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import LoadingIndicator from './LoadingIndicator'

// Welcome message shown when the chat is empty
const WELCOME_MESSAGE = {
  role: 'agent',
  content: `Hello! I'm SEC Insight Agent — I answer questions using real SEC EDGAR filings.

Here are some things you can ask me:

- *"What risks did Tesla mention in their latest 10-K?"*
- *"Did Apple discuss AI in their last quarterly report?"*
- *"What was Microsoft's revenue in their most recent annual filing?"*
- *"Summarize Nvidia's business overview from their 10-K"*

Just type your question below and I'll search the filings to find the answer.`,
  sources: [],
}

/**
 * @param {Object} props
 * @param {Array}   props.messages          - Array of { role, content, sources } message objects
 * @param {boolean} props.isLoading         - Whether to show the loading indicator at the bottom
 */
function ChatWindow({ messages, isLoading }) {
  // Ref to the invisible div at the bottom of the message list
  const bottomRef = useRef(null)

  // Scroll to the bottom whenever messages change or loading state changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  const hasMessages = messages.length > 0

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Always show the welcome message at the top */}
        <MessageBubble
          role={WELCOME_MESSAGE.role}
          content={WELCOME_MESSAGE.content}
          sources={WELCOME_MESSAGE.sources}
        />

        {/* Conversation messages */}
        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            role={message.role}
            content={message.content}
            sources={message.sources}
          />
        ))}

        {/* Loading indicator — shown while waiting for the agent */}
        {isLoading && <LoadingIndicator />}

        {/* Invisible sentinel element — scroll target */}
        <div ref={bottomRef} className="h-px" />
      </div>
    </div>
  )
}

export default ChatWindow
