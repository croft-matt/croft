export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assets: {
        Row: {
          confidence: number | null
          created_at: string
          email_id: string
          filename: string
          id: string
          likely_type: string | null
          mime_type: string | null
          size_bytes: number | null
          status: string
          status_updated_at: string | null
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          email_id: string
          filename: string
          id?: string
          likely_type?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          status?: string
          status_updated_at?: string | null
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          email_id?: string
          filename?: string
          id?: string
          likely_type?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          status?: string
          status_updated_at?: string | null
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_identities: {
        Row: {
          canonical_name: string | null
          canonical_organisation: string | null
          created_at: string
          id: string
          name_locked: boolean
          primary_contact_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          canonical_name?: string | null
          canonical_organisation?: string | null
          created_at?: string
          id?: string
          name_locked?: boolean
          primary_contact_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          canonical_name?: string | null
          canonical_organisation?: string | null
          created_at?: string
          id?: string
          name_locked?: boolean
          primary_contact_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_identities_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_identities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_merge_candidates: {
        Row: {
          contact_id_high: string
          contact_id_low: string
          created_at: string
          decided_at: string | null
          id: string
          score: number
          signals: Json
          status: string
          workspace_id: string
        }
        Insert: {
          contact_id_high: string
          contact_id_low: string
          created_at?: string
          decided_at?: string | null
          id?: string
          score: number
          signals?: Json
          status?: string
          workspace_id: string
        }
        Update: {
          contact_id_high?: string
          contact_id_low?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          score?: number
          signals?: Json
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_merge_candidates_contact_id_high_fkey"
            columns: ["contact_id_high"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_merge_candidates_contact_id_low_fkey"
            columns: ["contact_id_low"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_merge_candidates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email_address: string
          first_seen_at: string
          id: string
          identity_id: string | null
          last_seen_at: string
          name: string | null
          organisation: string | null
          phone: string | null
          role: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email_address: string
          first_seen_at?: string
          id?: string
          identity_id?: string | null
          last_seen_at?: string
          name?: string | null
          organisation?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email_address?: string
          first_seen_at?: string
          id?: string
          identity_id?: string | null
          last_seen_at?: string
          name?: string | null
          organisation?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "contact_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          access_token_encrypted: string | null
          connected_at: string
          email_address: string
          forwarding_configured: boolean
          history_imported: boolean
          id: string
          last_used_at: string | null
          provider: string
          refresh_token_encrypted: string | null
          scopes: string[]
          token_expires_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_at?: string
          email_address: string
          forwarding_configured?: boolean
          history_imported?: boolean
          id?: string
          last_used_at?: string | null
          provider: string
          refresh_token_encrypted?: string | null
          scopes: string[]
          token_expires_at: string
          user_id: string
          workspace_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_at?: string
          email_address?: string
          forwarding_configured?: boolean
          history_imported?: boolean
          id?: string
          last_used_at?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[]
          token_expires_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_processing_log: {
        Row: {
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          created_at: string
          duration_ms: number | null
          email_id: string
          error: string | null
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          tier: number
        }
        Insert: {
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          email_id: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          tier: number
        }
        Update: {
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          email_id?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          tier?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_processing_log_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          attachments: Json
          body_html: string | null
          body_text: string | null
          cc_addresses: Json
          created_at: string
          email_references: string | null
          embedding: string | null
          extraction: Json | null
          extraction_complete: boolean | null
          from_address: string
          from_name: string | null
          gmail_message_id: string | null
          id: string
          in_reply_to: string | null
          message_id: string
          processed_at: string | null
          processing_attempts: number
          processing_state: string
          received_at: string
          requires_response: boolean | null
          resend_email_id: string | null
          response_by: string | null
          source: string
          subject: string | null
          subject_summary: string | null
          thread_id: string | null
          to_addresses: Json
          urgency_reason: string | null
          urgency_score: number | null
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json
          created_at?: string
          email_references?: string | null
          embedding?: string | null
          extraction?: Json | null
          extraction_complete?: boolean | null
          from_address: string
          from_name?: string | null
          gmail_message_id?: string | null
          id?: string
          in_reply_to?: string | null
          message_id: string
          processed_at?: string | null
          processing_attempts?: number
          processing_state?: string
          received_at?: string
          requires_response?: boolean | null
          resend_email_id?: string | null
          response_by?: string | null
          source?: string
          subject?: string | null
          subject_summary?: string | null
          thread_id?: string | null
          to_addresses?: Json
          urgency_reason?: string | null
          urgency_score?: number | null
          workspace_id: string
        }
        Update: {
          attachments?: Json
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json
          created_at?: string
          email_references?: string | null
          embedding?: string | null
          extraction?: Json | null
          extraction_complete?: boolean | null
          from_address?: string
          from_name?: string | null
          gmail_message_id?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string
          processed_at?: string | null
          processing_attempts?: number
          processing_state?: string
          received_at?: string
          requires_response?: boolean | null
          resend_email_id?: string | null
          response_by?: string | null
          source?: string
          subject?: string | null
          subject_summary?: string | null
          thread_id?: string | null
          to_addresses?: Json
          urgency_reason?: string | null
          urgency_score?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          closed_at: string | null
          closed_by_email_id: string | null
          confidence: number
          created_at: string
          description: string
          due: string | null
          email_id: string
          id: string
          intent: string
          owner: string | null
          parent_job_id: string | null
          source: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by_email_id?: string | null
          confidence: number
          created_at?: string
          description: string
          due?: string | null
          email_id: string
          id?: string
          intent: string
          owner?: string | null
          parent_job_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by_email_id?: string | null
          confidence?: number
          created_at?: string
          description?: string
          due?: string | null
          email_id?: string
          id?: string
          intent?: string
          owner?: string | null
          parent_job_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_closed_by_email_id_fkey"
            columns: ["closed_by_email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      room_blocks: {
        Row: {
          block_type: string
          created_at: string
          id: string
          position: number
          room_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          block_type: string
          created_at?: string
          id?: string
          position?: number
          room_id: string
          status: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          block_type?: string
          created_at?: string
          id?: string
          position?: number
          room_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      room_emails: {
        Row: {
          created_at: string
          email_id: string
          id: string
          room_id: string
          source: string
        }
        Insert: {
          created_at?: string
          email_id: string
          id?: string
          room_id: string
          source?: string
        }
        Update: {
          created_at?: string
          email_id?: string
          id?: string
          room_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_emails_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          alert_text: string | null
          alert_text_updated_at: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          parent_room_id: string | null
          progress_closed: number
          progress_total: number
          room_data: Json
          room_status: string | null
          room_status_updated_at: string | null
          room_summary: string | null
          room_summary_updated_at: string | null
          status: string
          updated_at: string
          watch_context: Json | null
          workspace_id: string
        }
        Insert: {
          alert_text?: string | null
          alert_text_updated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          parent_room_id?: string | null
          progress_closed?: number
          progress_total?: number
          room_data?: Json
          room_status?: string | null
          room_status_updated_at?: string | null
          room_summary?: string | null
          room_summary_updated_at?: string | null
          status?: string
          updated_at?: string
          watch_context?: Json | null
          workspace_id: string
        }
        Update: {
          alert_text?: string | null
          alert_text_updated_at?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_room_id?: string | null
          progress_closed?: number
          progress_total?: number
          room_data?: Json
          room_status?: string | null
          room_status_updated_at?: string | null
          room_summary?: string | null
          room_summary_updated_at?: string | null
          status?: string
          updated_at?: string
          watch_context?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_parent_room_id_fkey"
            columns: ["parent_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_senders: {
        Row: {
          created_at: string
          email_address: string
          id: string
          label: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email_address: string
          id?: string
          label?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          email_address?: string
          id?: string
          label?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_senders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          theme_preference: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          theme_preference?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          theme_preference?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          active: boolean
          created_at: string
          croft_email_address: string | null
          id: string
          name: string
          onboarding_complete: boolean
          receiving_address: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          croft_email_address?: string | null
          id?: string
          name: string
          onboarding_complete?: boolean
          receiving_address?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          croft_email_address?: string | null
          id?: string
          name?: string
          onboarding_complete?: boolean
          receiving_address?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_workspace_with_owner: {
        Args: {
          p_croft_email_address: string
          p_name: string
          p_receiving_address: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      match_emails_for_context: {
        Args: {
          match_count?: number
          p_exclude_email_id: string
          p_workspace_id: string
          query_embedding: string
        }
        Returns: {
          distance: number
          email_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
