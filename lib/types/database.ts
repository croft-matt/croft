// Re-exports all Supabase-generated types.
// The generated output lives in database.generated.ts and is the only file
// that pnpm types:gen overwrites. This file is stable across schema changes.
export * from './database.generated'

import type { Tables } from './database.generated'

// ---------------------------------------------------------------------------
// Manually maintained types. Keep in sync with schema changes.
// pnpm types:gen does not touch this file.
// ---------------------------------------------------------------------------

export type Email = Tables<'emails'>
export type Room = Tables<'rooms'>
export type Job = Tables<'jobs'>
export type Asset = Tables<'assets'>

export interface AttachmentMeta {
  filename: string
  content_type: string
  size: number
}

export interface ExtractedContact {
  name: string
  email: string
  role: string | null
}

export interface Extraction {
  subject_summary: string
  room_suggestions: string[]
  extraction_complete: boolean
  confidence: number
  jobs: Array<{
    intent: 'REQUEST' | 'DELIVER' | 'CONFIRM' | 'CHASE' | 'QUERY' | 'INTRODUCE'
    description: string
    owner: string | null
    due: string | null
    confidence: number
    relation: 'new' | 'duplicate' | 'update' | 'chase_of'
    relates_to_job_id: string | null
  }>
  entities: {
    contacts: ExtractedContact[]
    assets: Array<{ filename: string; likely_type: string; confidence: number }>
    dates: Array<{ date: string; context: string }>
    organisations: string[]
  }
  closes_jobs: string[]
  facts: Array<{
    category: string
    key: string
    value: string
    confidence: number
    relation: 'new' | 'restatement' | 'correction'
  }>
}
