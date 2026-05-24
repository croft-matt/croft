import { createClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/types/database'

export interface OpenLoop extends Job {
  age_days: number
  from_name: string | null
}

export interface OpenLoops {
  yourCourt: OpenLoop[]
  theirCourt: OpenLoop[]
}

export async function getConnectedAddresses(workspaceId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)
  return (data ?? []).map((r) => r.email_address)
}

// Pure function: builds OpenLoops from pre-fetched jobs, an email->from_name map,
// and the set of connected addresses. No DB calls. Safe to call on client or server.
export function buildOpenLoops(
  jobs: Job[],
  fromNameMap: Map<string, string | null>,
  connectedAddresses: Set<string>,
): OpenLoops {
  const now = new Date()

  const openLoops: OpenLoop[] = jobs
    .filter((j) => j.status === 'open')
    .map((job) => {
      const createdAt = new Date(job.created_at)
      const age_days = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      return {
        ...job,
        age_days,
        from_name: fromNameMap.get(job.email_id) ?? null,
      }
    })
    // Oldest first
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const yourCourt = openLoops.filter((l) => l.owner != null && connectedAddresses.has(l.owner))
  const theirCourt = openLoops.filter((l) => l.owner == null || !connectedAddresses.has(l.owner))

  return { yourCourt, theirCourt }
}
