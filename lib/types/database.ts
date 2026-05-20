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

export type WorkspaceMemberRole = 'owner' | 'member'

export interface Workspace {
  id: string
  name: string
  active: boolean
  receiving_address: string | null
  croft_email_address: string | null
  created_at: string
}

export type EmailAccountProvider = 'google'

export interface EmailAccount {
  id: string
  workspace_id: string
  user_id: string
  provider: EmailAccountProvider
  email_address: string
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string
  scopes: string[]
  forwarding_configured: boolean
  history_imported: boolean
  connected_at: string
  last_used_at: string | null
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
  resend_email_id: string | null
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

export interface Room {
  id: string
  workspace_id: string
  parent_room_id: string | null
  name: string
  description: string | null
  created_by: string | null
  archived_at: string | null
  room_data: Record<string, unknown>
  progress_total: number
  progress_closed: number
  created_at: string
  updated_at: string
}

export type RoomEmailSource = 'user' | 'ai'

export interface RoomEmail {
  id: string
  room_id: string
  email_id: string
  source: RoomEmailSource
  created_at: string
}

export type JobIntent =
  | 'REQUEST'
  | 'DELIVER'
  | 'CONFIRM'
  | 'CHASE'
  | 'QUERY'
  | 'INTRODUCE'

export type JobStatus = 'open' | 'closed' | 'cancelled'

export interface Job {
  id: string
  workspace_id: string
  email_id: string
  intent: JobIntent
  description: string
  owner: string | null
  due: string | null
  status: JobStatus
  confidence: number
  parent_job_id: string | null
  closed_at: string | null
  closed_by_email_id: string | null
  created_at: string
  updated_at: string
}

export type AssetStatus = 'received' | 'sent' | 'submitted' | 'accepted' | 'not_reviewed'

export interface Asset {
  id: string
  workspace_id: string
  email_id: string
  filename: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  likely_type: string | null
  confidence: number | null
  status: AssetStatus
  status_updated_at: string | null
  created_at: string
}

export interface Contact {
  id: string
  workspace_id: string
  email_address: string
  name: string | null
  role: string | null
  organisation: string | null
  phone: string | null
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace
        Insert: Omit<Workspace, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Workspace, 'id'>>
      }
      email_accounts: {
        Row: EmailAccount
        Insert: Omit<EmailAccount, 'id' | 'connected_at'> & { id?: string; connected_at?: string }
        Update: Partial<Omit<EmailAccount, 'id'>>
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
      rooms: {
        Row: Room
        Insert: Omit<Room, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<Room, 'id'>>
      }
      room_emails: {
        Row: RoomEmail
        Insert: Omit<RoomEmail, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
      }
      jobs: {
        Row: Job
        Insert: Omit<Job, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<Job, 'id'>>
      }
      assets: {
        Row: Asset
        Insert: Omit<Asset, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Asset, 'id'>>
      }
      contacts: {
        Row: Contact
        Insert: Omit<Contact, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<Contact, 'id'>>
      }
    }
  }
}
