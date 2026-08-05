export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
        Relationships: []
      }
      clients: {
        Row: {
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
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
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
      project_tasks: {
        Row: {
          created_at: string
          created_by: string | null
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
          created_at?: string
          created_by?: string | null
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
          created_at?: string
          created_by?: string | null
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
          client_id: string | null
          conversion_goal: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          kpi: string | null
          links: Json
          name: string
          opportunity_id: string | null
          owner_id: string | null
          scope: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["service_type"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          conversion_goal?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kpi?: string | null
          links?: Json
          name: string
          opportunity_id?: string | null
          owner_id?: string | null
          scope?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          type: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          conversion_goal?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kpi?: string | null
          links?: Json
          name?: string
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
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      activity_type: "nota" | "llamada" | "email" | "reunion" | "tarea"
      automation_env: "produccion" | "staging" | "desarrollo"
      automation_status:
        | "discovery"
        | "construccion"
        | "activo"
        | "pausado"
        | "monitoreo"
      client_status: "activo" | "pausado" | "finalizado"
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
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T]
