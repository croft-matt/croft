import type { EmailPanelData } from '@/lib/email/actions'

// Module-level cache. Survives panel close/reopen within the same browser session.
// Does not persist across page reloads — data is always fresh on a hard refresh.
const cache = new Map<string, EmailPanelData>()

export function getPanelCache(emailId: string): EmailPanelData | undefined {
  return cache.get(emailId)
}

export function setPanelCache(emailId: string, data: EmailPanelData): void {
  // Cap at 50 entries. EmailPanelData is a few KB per entry.
  // Evict oldest entry (insertion order) if at capacity.
  if (cache.size >= 50) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(emailId, data)
}

// Fire-and-forget: fetch and cache if not already present.
// Safe to call from mouseenter — does nothing if already cached.
export async function warmPanelCache(emailId: string): Promise<void> {
  if (cache.has(emailId)) return
  const { getEmailPanelData } = await import('@/lib/email/actions')
  const data = await getEmailPanelData(emailId)
  if (data) setPanelCache(emailId, data)
}
