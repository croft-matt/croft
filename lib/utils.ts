import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const mins = diffMs / 60000
  const hours = mins / 60
  const days = hours / 24
  if (mins < 2) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  if (hours < 24) return `${Math.floor(hours)}h ago`
  if (days < 7) return `${Math.floor(days)}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
