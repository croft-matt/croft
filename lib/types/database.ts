// Hand-written from schema. Regenerate with: pnpm types:gen
// once the Supabase CLI is configured.

export type ProcessingState =
  | 'received'
  | 'urgency_scanned'
  | 'queued'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'ignored'

export type JobIntent =
  | 'REQUEST'
  | 'DELIVER'
  | 'CONFIRM'
  | 'CHASE'
  | 'QUERY'
  | 'INTRODUCE'

export type WorkspaceMemberRole = 'owner' | 'member'

export interface Workspace {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceMemberRole
  created_at: string
}

export interface AttachmentMeta {
  filename: string
  size: number
  mime_type: string
}

export interface ExtractedJob {
  intent: JobIntent
  description: string
  owner: string | null
  due: string | null
  confidence: number
}

export interface ExtractedContact {
  name: string
  email: string
  role: string | null
}

export interface ExtractedAsset {
  filename: string
  likely_type: string
  confidence: number
}

export interface ExtractedDate {
  date: string
  context: string
}

export interface Extraction {
  subject_summary: string
  room_suggestions: string[]
  extraction_complete: boolean
  confidence: number
  jobs: ExtractedJob[]
  entities: {
    contacts: ExtractedContact[]
    assets: ExtractedAsset[]
    dates: ExtractedDate[]
    organisations: string[]
  }
  closes_jobs: string[]
}

export interface Email {
  id: string
  workspace_id: string
  message_id: string
  from_address: string
  from_name: string | null
  to_addresses: string[]
  cc_addresses: string[]
  subject: string | null
  body_text: string | null
  body_html: string | null
  received_at: string
  processing_state: ProcessingState
  urgency_score: number | null
  urgency_reason: string | null
  requires_response: boolean | null
  response_by: string | null
  subject_summary: string | null
  extraction: Extraction | null
  extraction_complete: boolean | null
  attachments: AttachmentMeta[]
  embedding: number[] | null
  processed_at: string | null
  created_at: string
}

export interface EmailProcessingLog {
  id: string
  email_id: string
  tier: 1 | 2 | 3
  model: string
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  duration_ms: number | null
  error: string | null
  created_at: string
}

export interface VipSender {
  id: string
  workspace_id: string
  email_address: string
  label: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace
        Insert: Omit<Workspace, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Workspace, 'id'>>
      }
      workspace_members: {
        Row: WorkspaceMember
        Insert: Omit<WorkspaceMember, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<WorkspaceMember, 'id'>>
      }
      emails: {
        Row: Email
        Insert: Omit<Email, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Email, 'id'>>
      }
      email_processing_log: {
        Row: EmailProcessingLog
        Insert: Omit<EmailProcessingLog, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
      }
      vip_senders: {
        Row: VipSender
        Insert: Omit<VipSender, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<VipSender, 'id'>>
      }
    }
  }
}
