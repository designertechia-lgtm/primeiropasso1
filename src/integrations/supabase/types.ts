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
      appointments: {
        Row: {
          appointment_date: string
          appointment_type: string
          block_type: string | null
          created_at: string
          end_time: string
          id: string
          notes: string | null
          patient_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          professional_id: string
          recurrence_group: string | null
          service_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          video_room_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_type?: string
          block_type?: string | null
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          professional_id: string
          recurrence_group?: string | null
          service_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          video_room_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_type?: string
          block_type?: string | null
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          professional_id?: string
          recurrence_group?: string | null
          service_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          video_room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "professional_services"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          carousel_items: Json | null
          content: string | null
          cover_image_url: string | null
          created_at: string
          font_size: string | null
          font_style: string | null
          id: string
          professional_id: string
          published: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          carousel_items?: Json | null
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          font_size?: string | null
          font_style?: string | null
          id?: string
          professional_id: string
          published?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          carousel_items?: Json | null
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          font_size?: string | null
          font_style?: string | null
          id?: string
          professional_id?: string
          published?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          professional_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          professional_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          professional_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      desliga_fluxo: {
        Row: {
          created_at: string
          fluxo_id: number
          phone: string | null
        }
        Insert: {
          created_at?: string
          fluxo_id?: number
          phone?: string | null
        }
        Update: {
          created_at?: string
          fluxo_id?: number
          phone?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          fts: unknown
          id_vector: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          fts?: unknown
          id_vector?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          fts?: unknown
          id_vector?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          agent_enabled: boolean
          created_at: string
          email: string | null
          id: string
          interest: string | null
          last_message_at: string | null
          name: string
          origin_platform: string
          pipeline_stage: string
          professional_id: string
          whatsapp: string | null
        }
        Insert: {
          agent_enabled?: boolean
          created_at?: string
          email?: string | null
          id?: string
          interest?: string | null
          last_message_at?: string | null
          name: string
          origin_platform?: string
          pipeline_stage?: string
          professional_id: string
          whatsapp?: string | null
        }
        Update: {
          agent_enabled?: boolean
          created_at?: string
          email?: string | null
          id?: string
          interest?: string | null
          last_message_at?: string | null
          name?: string
          origin_platform?: string
          pipeline_stage?: string
          professional_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      patient_professionals: {
        Row: {
          created_at: string | null
          id: string
          patient_id: string
          professional_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          patient_id: string
          professional_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          patient_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_professionals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_documents: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_url: string
          id: string
          id_vector: number | null
          professional_id: string
          rag_status: string
          webhook_status: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number
          file_url: string
          id?: string
          id_vector?: number | null
          professional_id: string
          rag_status?: string
          webhook_status?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          id_vector?: number | null
          professional_id?: string
          rag_status?: string
          webhook_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_documents_id_vector_fkey"
            columns: ["id_vector"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id_vector"]
          },
          {
            foreignKeyName: "professional_documents_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number | null
          professional_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price?: number | null
          professional_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number | null
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_settings: {
        Row: {
          created_at: string
          id: string
          professional_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          professional_id: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          professional_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_settings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          about_image_url: string | null
          address: string | null
          approaches: string[] | null
          background_color: string | null
          bio: string | null
          color_payment_paid: string | null
          color_payment_pending: string | null
          color_status_cancelled: string | null
          color_status_completed: string | null
          color_status_confirmed: string | null
          color_status_pending: string | null
          contact_subtitle: string | null
          contact_title: string | null
          created_at: string
          crp: string | null
          dark_background_color: string | null
          dark_mode: boolean | null
          dark_primary_color: string | null
          dark_secondary_color: string | null
          email: string | null
          font_family: string | null
          font_size_scale: string | null
          full_name: string | null
          hero_bg_opacity: number | null
          hero_bg_overlay: string | null
          hero_bg_url: string | null
          hero_image_url: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          instagram: string | null
          linkedin: string | null
          logo_url: string | null
          pain_items: Json | null
          pain_subtitle: string | null
          pain_title: string | null
          phone: string | null
          photo_fit: string
          photo_style: string
          photo_url: string | null
          price_first_session: number | null
          price_max: number | null
          price_min: number | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          solution_items: Json | null
          solution_subtitle: string | null
          solution_title: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          about_image_url?: string | null
          address?: string | null
          approaches?: string[] | null
          background_color?: string | null
          bio?: string | null
          color_payment_paid?: string | null
          color_payment_pending?: string | null
          color_status_cancelled?: string | null
          color_status_completed?: string | null
          color_status_confirmed?: string | null
          color_status_pending?: string | null
          contact_subtitle?: string | null
          contact_title?: string | null
          created_at?: string
          crp?: string | null
          dark_background_color?: string | null
          dark_mode?: boolean | null
          dark_primary_color?: string | null
          dark_secondary_color?: string | null
          email?: string | null
          font_family?: string | null
          font_size_scale?: string | null
          full_name?: string | null
          hero_bg_opacity?: number | null
          hero_bg_overlay?: string | null
          hero_bg_url?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          logo_url?: string | null
          pain_items?: Json | null
          pain_subtitle?: string | null
          pain_title?: string | null
          phone?: string | null
          photo_fit?: string
          photo_style?: string
          photo_url?: string | null
          price_first_session?: number | null
          price_max?: number | null
          price_min?: number | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          solution_items?: Json | null
          solution_subtitle?: string | null
          solution_title?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          about_image_url?: string | null
          address?: string | null
          approaches?: string[] | null
          background_color?: string | null
          bio?: string | null
          color_payment_paid?: string | null
          color_payment_pending?: string | null
          color_status_cancelled?: string | null
          color_status_completed?: string | null
          color_status_confirmed?: string | null
          color_status_pending?: string | null
          contact_subtitle?: string | null
          contact_title?: string | null
          created_at?: string
          crp?: string | null
          dark_background_color?: string | null
          dark_mode?: boolean | null
          dark_primary_color?: string | null
          dark_secondary_color?: string | null
          email?: string | null
          font_family?: string | null
          font_size_scale?: string | null
          full_name?: string | null
          hero_bg_opacity?: number | null
          hero_bg_overlay?: string | null
          hero_bg_url?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          logo_url?: string | null
          pain_items?: Json | null
          pain_subtitle?: string | null
          pain_title?: string | null
          phone?: string | null
          photo_fit?: string
          photo_style?: string
          photo_url?: string | null
          price_first_session?: number | null
          price_max?: number | null
          price_min?: number | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          solution_items?: Json | null
          solution_subtitle?: string | null
          solution_title?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      pix_settings: {
        Row: {
          id: string
          pix_key: string
          pix_key_type: string
          beneficiary_name: string
          bank_name: string | null
          instructions: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          pix_key: string
          pix_key_type: string
          beneficiary_name: string
          bank_name?: string | null
          instructions?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          pix_key?: string
          pix_key_type?: string
          beneficiary_name?: string
          bank_name?: string | null
          instructions?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          id: string
          name: string
          price_brl: number
          credits: number
          bonus_credits: number | null
          active: boolean | null
        }
        Insert: {
          id: string
          name: string
          price_brl: number
          credits: number
          bonus_credits?: number | null
          active?: boolean | null
        }
        Update: {
          id?: string
          name?: string
          price_brl?: number
          credits?: number
          bonus_credits?: number | null
          active?: boolean | null
        }
        Relationships: []
      }
      service_pricing: {
        Row: {
          service_key: string
          display_name: string
          unit: string
          base_cost_brl: number
          markup_pct: number | null
          description: string | null
          active: boolean | null
          updated_at: string | null
        }
        Insert: {
          service_key: string
          display_name: string
          unit: string
          base_cost_brl: number
          markup_pct?: number | null
          description?: string | null
          active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          service_key?: string
          display_name?: string
          unit?: string
          base_cost_brl?: number
          markup_pct?: number | null
          description?: string | null
          active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      app_announcements: {
        Row: {
          id: string
          message: string
          type: string
          is_active: boolean
          end_date: string | null
          created_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          message: string
          type?: string
          is_active?: boolean
          end_date?: string | null
          created_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          message?: string
          type?: string
          is_active?: boolean
          end_date?: string | null
          created_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feedbacks: {
        Row: {
          id: string
          author_id: string | null
          type: string
          status: string
          severity: string
          message: string
          screenshot_url: string | null
          nps_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id?: string | null
          type: string
          status?: string
          severity?: string
          message: string
          screenshot_url?: string | null
          nps_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string | null
          type?: string
          status?: string
          severity?: string
          message?: string
          screenshot_url?: string | null
          nps_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          key: string
          is_enabled: boolean
          description: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          is_enabled?: boolean
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          is_enabled?: boolean
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      super_admin_access: {
        Row: {
          user_id: string
          granted_by: string | null
          granted_at: string
          scopes: string[]
          revoked_at: string | null
          notes: string | null
          user_email: string | null
        }
        Insert: {
          user_id: string
          granted_by?: string | null
          granted_at?: string
          scopes?: string[]
          revoked_at?: string | null
          notes?: string | null
          user_email?: string | null
        }
        Update: {
          user_id?: string
          granted_by?: string | null
          granted_at?: string
          scopes?: string[]
          revoked_at?: string | null
          notes?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          description: string | null
          embed_url: string
          id: string
          professional_id: string
          published: boolean
          published_at: string | null
          script_json: Json | null
          thumbnail_url: string | null
          title: string
          trim_end: number | null
          trim_start: number | null
          updated_at: string
          video_format: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          embed_url: string
          id?: string
          professional_id: string
          published?: boolean
          published_at?: string | null
          script_json?: Json | null
          thumbnail_url?: string | null
          title: string
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string
          video_format?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          embed_url?: string
          id?: string
          professional_id?: string
          published?: boolean
          published_at?: string | null
          script_json?: Json | null
          thumbnail_url?: string | null
          title?: string
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string
          video_format?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      owner_mrr_monthly: {
        Args: { months_back?: number }
        Returns: {
          month_start: string
          mrr_brl: number
          active_count: number
        }[]
      }
      owner_subscription_status: {
        Args: { grace_days?: number }
        Returns: {
          status: string
          count: number
          total_brl: number
        }[]
      }
      owner_overdue_subscribers: {
        Args: { grace_days?: number }
        Returns: {
          professional_id: string
          full_name: string | null
          email: string | null
          whatsapp: string | null
          phone: string | null
          monthly_price_brl: number
          current_period_end: string
          days_overdue: number
          status: string
        }[]
      }
      hybrid_search: {
        Args: {
          full_text_weight?: number
          match_count: number
          query_embedding: string
          query_text: string
          rrf_k?: number
          semantic_weight?: number
        }
        Returns: {
          content: string
          id: number
          rank: number
          score: number
        }[]
      }
      match_documents_for_professional: {
        Args: {
          match_count?: number
          p_professional_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "professional" | "patient" | "admin"
      appointment_status: "pending" | "confirmed" | "cancelled" | "completed"
      payment_status: "pending" | "paid"
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
    Enums: {
      app_role: ["professional", "patient", "admin"],
      appointment_status: ["pending", "confirmed", "cancelled", "completed"],
      payment_status: ["pending", "paid"],
    },
  },
} as const
