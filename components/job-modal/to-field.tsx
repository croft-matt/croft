'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

export interface Recipient {
  name: string
  email: string
}

interface ToFieldProps {
  recipients: Recipient[]
  onChange: (recipients: Recipient[]) => void
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function ToField({ recipients, onChange }: ToFieldProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addRecipient(raw: string) {
    const value = raw.trim()
    if (!isValidEmail(value)) return
    if (recipients.some((r) => r.email === value)) {
      setInput('')
      return
    }
    onChange([...recipients, { name: value.split('@')[0], email: value }])
    setInput('')
  }

  function removeRecipient(email: string) {
    onChange(recipients.filter((r) => r.email !== email))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      addRecipient(input)
    }
    if (e.key === 'Backspace' && input === '' && recipients.length > 0) {
      onChange(recipients.slice(0, -1))
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">To</label>
      <div
        className="flex flex-wrap gap-1.5 min-h-9 rounded-md border border-input bg-input px-2.5 py-1.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {recipients.map((r) => (
          <span
            key={r.email}
            className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
          >
            {r.name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeRecipient(r.email) }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addRecipient(input)}
          placeholder={recipients.length === 0 ? 'name@example.com' : ''}
          className="flex-1 min-w-24 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Press Enter or comma to add</p>
    </div>
  )
}
