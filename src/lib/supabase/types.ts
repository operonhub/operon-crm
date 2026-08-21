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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          body: string | null
          completed: boolean
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          owner_id: string | null
          project_id: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          body?: string | null
          completed?: boolean
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          owner_id?: string | null
          project_id?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          body?: string | null
          completed?: boolean
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          owner_id?: string | null
          project_id?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_approvals: {
        Row: {
          action_summary: string
          action_type: string
          agent_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          rationale: string | null
          requested_at: string
          requested_by: string | null
          run_id: string | null
          status: Database["public"]["Enums"]["agent_approval_status"]
        }
        Insert: {
          action_summary: string
          action_type: string
          agent_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          rationale?: string | null
          requested_at?: string
          requested_by?: string | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["agent_approval_status"]
        }
        Update: {
          action_summary?: string
          action_type?: string
          agent_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          rationale?: string | null
          requested_at?: string
          requested_by?: string | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["agent_approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          client_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          initiated_by: string | null
          input_summary: string | null
          output_summary: string | null
          project_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["agent_run_status"]
          trigger_kind: string
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          input_summary?: string | null
          output_summary?: string | null
          project_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          trigger_kind?: string
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          input_summary?: string | null
          output_summary?: string | null
          project_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          trigger_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          allowed_actions: string[]
          approval_required_actions: string[]
          archived_at: string | null
          channels: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          instructions: string | null
          name: string
          owner_id: string | null
          prohibited_actions: string[]
          purpose: string | null
          slug: string
          status: Database["public"]["Enums"]["agent_status"]
          tools: string[]
          updated_at: string
        }
        Insert: {
          allowed_actions?: string[]
          approval_required_actions?: string[]
          archived_at?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          name: string
          owner_id?: string | null
          prohibited_actions?: string[]
          purpose?: string | null
          slug: string
          status?: Database["public"]["Enums"]["agent_status"]
          tools?: string[]
          updated_at?: string
        }
        Update: {
          allowed_actions?: string[]
          approval_required_actions?: string[]
          archived_at?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          name?: string
          owner_id?: string | null
          prohibited_actions?: string[]
          purpose?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["agent_status"]
          tools?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_handoffs: {
        Row: {
          conversation_id: string
          created_at: string
          from_profile_id: string
          id: string
          note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["collaboration_request_status"]
          to_profile_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_profile_id: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["collaboration_request_status"]
          to_profile_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_profile_id?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["collaboration_request_status"]
          to_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_handoffs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_handoffs_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_handoffs_to_profile_id_fkey"
            columns: ["to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string
          created_by: string | null
          environment: Database["public"]["Enums"]["automation_env"]
          id: string
          last_result: string | null
          last_run_at: string | null
          n8n_url: string | null
          n8n_workflow_id: string | null
          name: string
          project_id: string | null
          secret_ref: string | null
          status: Database["public"]["Enums"]["automation_status"]
          trigger: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          environment?: Database["public"]["Enums"]["automation_env"]
          id?: string
          last_result?: string | null
          last_run_at?: string | null
          n8n_url?: string | null
          n8n_workflow_id?: string | null
          name: string
          project_id?: string | null
          secret_ref?: string | null
          status?: Database["public"]["Enums"]["automation_status"]
          trigger?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          environment?: Database["public"]["Enums"]["automation_env"]
          id?: string
          last_result?: string | null
          last_run_at?: string | null
          n8n_url?: string | null
          n8n_workflow_id?: string | null
          name?: string
          project_id?: string | null
          secret_ref?: string | null
          status?: Database["public"]["Enums"]["automation_status"]
          trigger?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          ends_on: string | null
          goal: string | null
          id: string
          name: string
          segment: string | null
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          goal?: string | null
          id?: string
          name: string
          segment?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          goal?: string | null
          id?: string
          name?: string
          segment?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          organization_id: string | null
          owner_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          linkedin: string | null
          notes: string | null
          organization_id: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          linkedin?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          linkedin?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          message_kind: string
        }
        Insert: {
          author_id: string
          body: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          message_kind?: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          message_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          archived_at: string | null
          assigned_to: string | null
          channel: Database["public"]["Enums"]["conversation_channel"]
          client_id: string | null
          context_type: string
          created_at: string
          created_by: string
          financial_record_id: string | null
          id: string
          last_message_at: string
          opportunity_id: string | null
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["conversation_channel"]
          client_id?: string | null
          context_type?: string
          created_at?: string
          created_by: string
          financial_record_id?: string | null
          id?: string
          last_message_at?: string
          opportunity_id?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["conversation_channel"]
          client_id?: string | null
          context_type?: string
          created_at?: string
          created_by?: string
          financial_record_id?: string | null
          id?: string
          last_message_at?: string
          opportunity_id?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records_operational"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_updates: {
        Row: {
          blocker: string | null
          created_at: string
          id: string
          needs_help: boolean
          next_focus: string | null
          profile_id: string
          progress: string
          update_date: string
          updated_at: string
        }
        Insert: {
          blocker?: string | null
          created_at?: string
          id?: string
          needs_help?: boolean
          next_focus?: string | null
          profile_id: string
          progress: string
          update_date?: string
          updated_at?: string
        }
        Update: {
          blocker?: string | null
          created_at?: string
          id?: string
          needs_help?: boolean
          next_focus?: string | null
          profile_id?: string
          progress?: string
          update_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_updates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          body: string | null
          conversation_id: string
          decided_at: string
          decided_by: string
          id: string
          superseded_by: string | null
          title: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          decided_at?: string
          decided_by: string
          id?: string
          superseded_by?: string | null
          title: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          decided_at?: string
          decided_by?: string
          id?: string
          superseded_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          financial_record_id: string
          id: string
          note: string | null
          paid_on: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          financial_record_id: string
          id?: string
          note?: string | null
          paid_on?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          financial_record_id?: string
          id?: string
          note?: string | null
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_payments_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_payments_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records_operational"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_record_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          financial_record_id: string
          id: number
          next_data: Json | null
          note: string | null
          previous_data: Json | null
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          financial_record_id: string
          id?: never
          next_data?: Json | null
          note?: string | null
          previous_data?: Json | null
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          financial_record_id?: string
          id?: never
          next_data?: Json | null
          note?: string | null
          previous_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_record_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_record_history_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_record_history_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records_operational"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          client_id: string | null
          concept: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          notes: string | null
          paid_amount: number
          paid_at: string | null
          project_id: string | null
          record_type: string
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          client_id?: string | null
          concept: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          project_id?: string | null
          record_type: string
          total_amount: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          client_id?: string | null
          concept?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          project_id?: string | null
          record_type?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_config: {
        Row: {
          id: number
          secret: string
        }
        Insert: {
          id?: number
          secret: string
        }
        Update: {
          id?: number
          secret?: string
        }
        Relationships: []
      }
      ingest_errors: {
        Row: {
          created_at: string
          error: string
          id: number
          payload: Json | null
        }
        Insert: {
          created_at?: string
          error: string
          id?: never
          payload?: Json | null
        }
        Update: {
          created_at?: string
          error?: string
          id?: never
          payload?: Json | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          notes: string | null
          organization_id: string | null
          owner_id: string | null
          segment: string | null
          service_interest: Database["public"]["Enums"]["service_type"] | null
          source: Database["public"]["Enums"]["lead_source"]
          source_url: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          segment?: string | null
          service_interest?: Database["public"]["Enums"]["service_type"] | null
          source?: Database["public"]["Enums"]["lead_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          segment?: string | null
          service_interest?: Database["public"]["Enums"]["service_type"] | null
          source?: Database["public"]["Enums"]["lead_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_mentions: {
        Row: {
          created_at: string
          message_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_mentions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          conversation_id: string | null
          created_at: string
          href: string | null
          id: string
          message_id: string | null
          notification_type: string
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          href?: string | null
          id?: string
          message_id?: string | null
          notification_type: string
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          href?: string | null
          id?: string
          message_id?: string | null
          notification_type?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          lost_reason: string | null
          next_action: string | null
          next_action_date: string | null
          organization_id: string | null
          owner_id: string | null
          probability: number | null
          service_type: Database["public"]["Enums"]["service_type"] | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          title: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          next_action?: string | null
          next_action_date?: string | null
          organization_id?: string | null
          owner_id?: string | null
          probability?: number | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          title: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          next_action?: string | null
          next_action_date?: string | null
          organization_id?: string | null
          owner_id?: string | null
          probability?: number | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          domain: string | null
          id: string
          industry: string | null
          linkedin: string | null
          name: string
          notes: string | null
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin?: string | null
          name: string
          notes?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin?: string | null
          name?: string
          notes?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_agents: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          project_id: string
          responsibility: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          project_id: string
          responsibility?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          project_id?: string
          responsibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_blockers: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          owner_id: string | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          owner_id?: string | null
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          owner_id?: string | null
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_blockers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_blockers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_blockers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_blockers_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_collaborators: {
        Row: {
          created_at: string
          created_by: string | null
          profile_id: string
          project_id: string
          responsibility: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          profile_id: string
          project_id: string
          responsibility?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          profile_id?: string
          project_id?: string
          responsibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_collaborators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          position: number
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          archived_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          owner_id: string | null
          position: number
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          area: string
          client_id: string | null
          conversion_goal: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          engagement_kind: string
          id: string
          kpi: string | null
          links: Json
          name: string
          operational_type: string | null
          opportunity_id: string | null
          owner_id: string | null
          scope: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["service_type"]
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          area?: string
          client_id?: string | null
          conversion_goal?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          engagement_kind?: string
          id?: string
          kpi?: string | null
          links?: Json
          name: string
          operational_type?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          scope?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          area?: string
          client_id?: string | null
          conversion_goal?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          engagement_kind?: string
          id?: string
          kpi?: string | null
          links?: Json
          name?: string
          operational_type?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          scope?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          note: string | null
          requested_by: string
          requested_from: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["collaboration_request_status"]
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          note?: string | null
          requested_by: string
          requested_from: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["collaboration_request_status"]
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          note?: string | null
          requested_by?: string
          requested_from?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["collaboration_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_requested_from_fkey"
            columns: ["requested_from"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      financial_records_operational: {
        Row: {
          balance: number | null
          canceled_at: string | null
          client_id: string | null
          concept: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          due_date: string | null
          id: string | null
          notes: string | null
          operational_status: string | null
          paid_amount: number | null
          paid_at: string | null
          project_id: string | null
          record_type: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          balance?: never
          canceled_at?: string | null
          client_id?: string | null
          concept?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string | null
          notes?: string | null
          operational_status?: never
          paid_amount?: number | null
          paid_at?: string | null
          project_id?: string | null
          record_type?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          balance?: never
          canceled_at?: string | null
          client_id?: string | null
          concept?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string | null
          notes?: string | null
          operational_status?: never
          paid_amount?: number | null
          paid_at?: string | null
          project_id?: string | null
          record_type?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_internal_notification: {
        Args: {
          p_body?: string
          p_conversation_id?: string
          p_href?: string
          p_notification_type: string
          p_recipient_id: string
          p_title: string
        }
        Returns: string
      }
      create_team_message: {
        Args: {
          p_agent_id?: string
          p_assigned_to?: string
          p_body: string
          p_client_id?: string
          p_conversation_id?: string
          p_financial_record_id?: string
          p_mention_ids?: string[]
          p_opportunity_id?: string
          p_project_id?: string
          p_task_id?: string
          p_title?: string
        }
        Returns: Json
      }
      ingest_lead: {
        Args: { p_payload: Json; p_secret: string }
        Returns: Json
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_internal_admin: { Args: never; Returns: boolean }
      is_internal_member: { Args: never; Returns: boolean }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_type: "nota" | "llamada" | "email" | "reunion" | "tarea"
      agent_approval_status: "pending" | "approved" | "rejected" | "cancelled"
      agent_run_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
      agent_status: "draft" | "active" | "paused" | "archived"
      automation_env: "produccion" | "staging" | "desarrollo"
      automation_status:
        | "discovery"
        | "construccion"
        | "activo"
        | "pausado"
        | "monitoreo"
      client_status: "activo" | "pausado" | "finalizado"
      collaboration_request_status:
        | "pending"
        | "accepted"
        | "resolved"
        | "rejected"
        | "cancelled"
      conversation_channel: "team" | "client" | "system"
      conversation_status: "open" | "resolved" | "archived"
      lead_source:
        | "scraping"
        | "lista_manual"
        | "referido"
        | "formulario"
        | "campana"
        | "inbound"
        | "n8n"
        | "otro"
      lead_status: "nuevo" | "calificado" | "descartado" | "convertido"
      opportunity_stage:
        | "nuevo"
        | "por_investigar"
        | "contactado"
        | "respondio"
        | "reunion_agendada"
        | "diagnostico_propuesta"
        | "negociacion"
        | "ganado"
        | "perdido"
        | "no_califica"
      priority_level: "baja" | "media" | "alta" | "urgente"
      project_status:
        | "discovery"
        | "en_progreso"
        | "revision"
        | "entregado"
        | "activo"
        | "pausado"
        | "cerrado"
      service_type:
        | "landing_page"
        | "automation"
        | "lead_generation"
        | "package"
      task_status: "pendiente" | "en_progreso" | "bloqueada" | "completada"
      user_role: "admin" | "operador"
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
  public: {
    Enums: {
      activity_type: ["nota", "llamada", "email", "reunion", "tarea"],
      agent_approval_status: ["pending", "approved", "rejected", "cancelled"],
      agent_run_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "cancelled",
      ],
      agent_status: ["draft", "active", "paused", "archived"],
      automation_env: ["produccion", "staging", "desarrollo"],
      automation_status: [
        "discovery",
        "construccion",
        "activo",
        "pausado",
        "monitoreo",
      ],
      client_status: ["activo", "pausado", "finalizado"],
      collaboration_request_status: [
        "pending",
        "accepted",
        "resolved",
        "rejected",
        "cancelled",
      ],
      conversation_channel: ["team", "client", "system"],
      conversation_status: ["open", "resolved", "archived"],
      lead_source: [
        "scraping",
        "lista_manual",
        "referido",
        "formulario",
        "campana",
        "inbound",
        "n8n",
        "otro",
      ],
      lead_status: ["nuevo", "calificado", "descartado", "convertido"],
      opportunity_stage: [
        "nuevo",
        "por_investigar",
        "contactado",
        "respondio",
        "reunion_agendada",
        "diagnostico_propuesta",
        "negociacion",
        "ganado",
        "perdido",
        "no_califica",
      ],
      priority_level: ["baja", "media", "alta", "urgente"],
      project_status: [
        "discovery",
        "en_progreso",
        "revision",
        "entregado",
        "activo",
        "pausado",
        "cerrado",
      ],
      service_type: [
        "landing_page",
        "automation",
        "lead_generation",
        "package",
      ],
      task_status: ["pendiente", "en_progreso", "bloqueada", "completada"],
      user_role: ["admin", "operador"],
    },
  },
} as const
