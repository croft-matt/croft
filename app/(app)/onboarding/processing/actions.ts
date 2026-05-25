'use server'

import { createClient } from '@/lib/supabase/server'

export interface ProcessingStatus {
  importTotal: number
  importN: number
  filterN: number
  classifyN: number
  rooms: number
  complete: boolean
}

export async function getProcessingStatus(workspaceId: string): Promise<ProcessingStatus> {
  const supabase = await createClient()

  const [
    { count: totalImported },
    { count: totalFiltered },
    { count: totalClassified },
    { count: totalRooms },
    { data: workspace },
  ] = await Promise.all([
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .neq('processing_state', 'ignored')
      .neq('processing_state', 'received'),
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('processing_state', ['processed', 'failed']),
    supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('workspaces')
      .select('onboarding_complete')
      .eq('id', workspaceId)
      .single(),
  ])

  return {
    importTotal: totalImported ?? 0,
    importN: totalImported ?? 0,
    filterN: totalFiltered ?? 0,
    classifyN: totalClassified ?? 0,
    rooms: totalRooms ?? 0,
    complete: workspace?.onboarding_complete ?? false,
  }
}
