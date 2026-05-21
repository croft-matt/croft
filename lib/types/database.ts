// Hand-written from schema. Regenerate with: pnpm types:gen
// once the Supabase CLI is configured.
// Note: Row types use `type` (not `interface`) so they satisfy Supabase's
// GenericTable constraint (Record<string, unknown>) in conditional types.

export type ProcessingState =
  | 'received'
  | 'urgency_scanned'
  | 'queued'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'ignored'

export type WorkspaceMemberRole = 'owner' | 'member'

export type Workspace = {
  id: string
  name: string
  active: boolean
  receiving_address: string | null
  croft_email_address: string | null
  created_at: string
}

export type EmailAccountProvider = 'google'

export type EmailAccount = {
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

export type WorkspaceMember = {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceMemberRole
  created_at: string
}

export type AttachmentMeta = {
  filename: string
  size: number
  mime_type: string
}

export type ExtractedJob = {
  intent: JobIntent
  description: string
  owner: string | null
  due: string | null
  confidence: number
}

export type ExtractedContact = {
  name: string
  email: string
  role: string | null
}

export type ExtractedAsset = {
  filename: string
  likely_type: string
  confidence: number
}

export type ExtractedDate = {
  date: string
  context: string
}

export type Extraction = {
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

export type Email = {
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

export type EmailProcessingLog = {
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

export type VipSender = {
  id: string
  workspace_id: string
  email_address: string
  label: string | null
  created_at: string
}

export type Room = {
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
  alert_text: string | null
  alert_text_updated_at: string | null
  created_at: string
  updated_at: string
}

export type RoomEmailSource = 'user' | 'ai'

export type RoomEmail = {
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

export type Job = {
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

export type Asset = {
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

export type Contact = {
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

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace
        Insert: {
          id?: string
          name: string
          active?: boolean
          receiving_address?: string | null
          croft_email_address?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Workspace, 'id'>>
        Relationships: []
      }
      email_accounts: {
        Row: EmailAccount
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          provider: EmailAccountProvider
          email_address: string
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at: string
          scopes: string[]
          forwarding_configured?: boolean
          history_imported?: boolean
          connected_at?: string
          last_used_at?: string | null
        }
        Update: Partial<Omit<EmailAccount, 'id'>>
        Relationships: []
      }
      workspace_members: {
        Row: WorkspaceMember
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role: WorkspaceMemberRole
          created_at?: string
        }
        Update: Partial<Omit<WorkspaceMember, 'id'>>
        Relationships: []
      }
      emails: {
        Row: Email
        Insert: {
          id?: string
          workspace_id: string
          message_id: string
          from_address: string
          from_name?: string | null
          to_addresses: string[]
          cc_addresses: string[]
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          received_at: string
          processing_state: ProcessingState
          urgency_score?: number | null
          urgency_reason?: string | null
          requires_response?: boolean | null
          response_by?: string | null
          subject_summary?: string | null
          extraction?: Extraction | null
          extraction_complete?: boolean | null
          attachments?: AttachmentMeta[]
          resend_email_id?: string | null
          embedding?: number[] | null
          processed_at?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Email, 'id'>>
        Relationships: []
      }
      email_processing_log: {
        Row: EmailProcessingLog
        Insert: {
          id?: string
          email_id: string
          tier: 1 | 2 | 3
          model: string
          input_tokens?: number | null
          output_tokens?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          duration_ms?: number | null
          error?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      vip_senders: {
        Row: VipSender
        Insert: {
          id?: string
          workspace_id: string
          email_address: string
          label?: string | null
          created_at?: string
        }
        Update: Partial<Omit<VipSender, 'id'>>
        Relationships: []
      }
      rooms: {
        Row: Room
        Insert: {
          id?: string
          workspace_id: string
          parent_room_id?: string | null
          name: string
          description?: string | null
          created_by?: string | null
          archived_at?: string | null
          room_data?: Record<string, unknown>
          progress_total?: number
          progress_closed?: number
          alert_text?: string | null
          alert_text_updated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Room, 'id'>>
        Relationships: []
      }
      room_emails: {
        Row: RoomEmail
        Insert: {
          id?: string
          room_id: string
          email_id: string
          source: RoomEmailSource
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      jobs: {
        Row: Job
        Insert: {
          id?: string
          workspace_id: string
          email_id: string
          intent: JobIntent
          description: string
          owner?: string | null
          due?: string | null
          status: JobStatus
          confidence: number
          parent_job_id?: string | null
          closed_at?: string | null
          closed_by_email_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Job, 'id'>>
        Relationships: []
      }
      assets: {
        Row: Asset
        Insert: {
          id?: string
          workspace_id: string
          email_id: string
          filename: string
          storage_path: string
          mime_type?: string | null
          size_bytes?: number | null
          likely_type?: string | null
          confidence?: number | null
          status?: AssetStatus
          status_updated_at?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Asset, 'id'>>
        Relationships: []
      }
      contacts: {
        Row: Contact
        Insert: {
          id?: string
          workspace_id: string
          email_address: string
          name?: string | null
          role?: string | null
          organisation?: string | null
          phone?: string | null
          first_seen_at?: string
          last_seen_at: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Contact, 'id'>>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
