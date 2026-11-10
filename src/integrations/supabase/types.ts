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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          image_path: string | null
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          image_path?: string | null
          published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          image_path?: string | null
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      benefit_releases: {
        Row: {
          created_at: string
          date_released: string | null
          description: string
          id: string
          kind: string
          notes: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_released?: string | null
          description?: string
          id?: string
          kind: string
          notes?: string | null
          released_by?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_released?: string | null
          description?: string
          id?: string
          kind?: string
          notes?: string | null
          released_by?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_releases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_blocks: {
        Row: {
          block_date: string
          created_at: string
          created_by: string | null
          id: string
          reason: string
          slot: string | null
        }
        Insert: {
          block_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          slot?: string | null
        }
        Update: {
          block_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "court_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_reservations: {
        Row: {
          contact_number: string
          created_at: string
          id: string
          purpose: string
          rejection_reason: string | null
          res_date: string
          slot: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_number: string
          created_at?: string
          id?: string
          purpose: string
          rejection_reason?: string | null
          res_date: string
          slot: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_number?: string
          created_at?: string
          id?: string
          purpose?: string
          rejection_reason?: string | null
          res_date?: string
          slot?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          label: string
          sort: number
        }
        Insert: {
          enabled?: boolean
          key: string
          label: string
          sort?: number
        }
        Update: {
          enabled?: boolean
          key?: string
          label?: string
          sort?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_reports: {
        Row: {
          admin_reply: string | null
          barangay: string
          category: string
          created_at: string
          description: string
          id: string
          photo_path: string | null
          purok: string
          status: Database["public"]["Enums"]["problem_status"]
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          barangay?: string
          category: string
          created_at?: string
          description: string
          id?: string
          photo_path?: string | null
          purok?: string
          status?: Database["public"]["Enums"]["problem_status"]
          street?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          barangay?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          photo_path?: string | null
          purok?: string
          status?: Database["public"]["Enums"]["problem_status"]
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          barangay: string
          birthdate: string | null
          contact_number: string
          created_at: string
          document_path: string | null
          email: string
          first_name: string
          id: string
          is_pwd: boolean
          is_senior: boolean
          last_name: string
          middle_name: string
          purok: string
          pwd_disability_type: string | null
          pwd_id_number: string | null
          rejection_reason: string | null
          senior_id_number: string | null
          sex: string | null
          status: Database["public"]["Enums"]["account_status"]
          street: string
          updated_at: string
        }
        Insert: {
          barangay?: string
          birthdate?: string | null
          contact_number?: string
          created_at?: string
          document_path?: string | null
          email: string
          first_name?: string
          id: string
          is_pwd?: boolean
          is_senior?: boolean
          last_name?: string
          middle_name?: string
          purok?: string
          pwd_disability_type?: string | null
          pwd_id_number?: string | null
          rejection_reason?: string | null
          senior_id_number?: string | null
          sex?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          street?: string
          updated_at?: string
        }
        Update: {
          barangay?: string
          birthdate?: string | null
          contact_number?: string
          created_at?: string
          document_path?: string | null
          email?: string
          first_name?: string
          id?: string
          is_pwd?: boolean
          is_senior?: boolean
          last_name?: string
          middle_name?: string
          purok?: string
          pwd_disability_type?: string | null
          pwd_id_number?: string | null
          rejection_reason?: string | null
          senior_id_number?: string | null
          sex?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          street?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          code: string
          created_at: string
          details: string
          id: string
          rejection_reason: string | null
          service_id: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          details?: string
          id?: string
          rejection_reason?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          details?: string
          id?: string
          rejection_reason?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          code: string
          description: string
          enabled: boolean
          fee: number
          id: string
          name: string
          requirements: Json
          sort: number
        }
        Insert: {
          code: string
          description?: string
          enabled?: boolean
          fee?: number
          id?: string
          name: string
          requirements?: Json
          sort?: number
        }
        Update: {
          code?: string
          description?: string
          enabled?: boolean
          fee?: number
          id?: string
          name?: string
          requirements?: Json
          sort?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          court_fee: number
          facebook_url: string
          hall_address: string
          id: number
          office_email: string
          office_hours: string
          office_phone: string
          updated_at: string
        }
        Insert: {
          court_fee?: number
          facebook_url?: string
          hall_address?: string
          id?: number
          office_email?: string
          office_hours?: string
          office_phone?: string
          updated_at?: string
        }
        Update: {
          court_fee?: number
          facebook_url?: string
          hall_address?: string
          id?: number
          office_email?: string
          office_hours?: string
          office_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      registry_releases: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period: string | null
          registrant_id: string
          release_date: string | null
          status: Database["public"]["Enums"]["registry_release_status"]
          benefit_type: string
          benefit_year: number
          claimant_name: string | null
          claimant_relationship: string | null
          claimed_at: string | null
          claimed_by_type: string | null
          id_presented: boolean
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period?: string | null
          registrant_id: string
          release_date?: string | null
          status?: Database["public"]["Enums"]["registry_release_status"]
          benefit_type: string
          benefit_year?: number
          claimant_name?: string | null
          claimant_relationship?: string | null
          claimed_at?: string | null
          claimed_by_type?: string | null
          id_presented?: boolean
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period?: string | null
          registrant_id?: string
          release_date?: string | null
          status?: Database["public"]["Enums"]["registry_release_status"]
          benefit_type?: string
          benefit_year?: number
          claimant_name?: string | null
          claimant_relationship?: string | null
          claimed_at?: string | null
          claimed_by_type?: string | null
          id_presented?: boolean
        }
        Relationships: []
      }
      registrants: {
        Row: {
          address: string
          birth_date: string
          category: Database["public"]["Enums"]["registry_category"]
          civil_status: string | null
          contact_number: string | null
          created_at: string
          disability_type: string | null
          encoded_by: string | null
          full_name: string
          id: string
          id_number: string | null
          pension_applicant: boolean
          receives_other_pension: boolean
          reference_code: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sex: string
          source: Database["public"]["Enums"]["registry_source"]
          status: Database["public"]["Enums"]["registry_status"]
          updated_at: string
          user_id: string | null
          applicant_type: string
          chk_disability: boolean
          chk_name_dob: boolean
          chk_photo_match: boolean
          chk_representative: boolean
          chk_residency: boolean
          id_expiry: string | null
          rep_contact_number: string | null
          rep_full_name: string | null
          rep_relationship: string | null
        }
        Insert: {
          address: string
          birth_date: string
          category: Database["public"]["Enums"]["registry_category"]
          civil_status?: string | null
          contact_number?: string | null
          created_at?: string
          disability_type?: string | null
          encoded_by?: string | null
          full_name: string
          id?: string
          id_number?: string | null
          pension_applicant?: boolean
          receives_other_pension?: boolean
          reference_code?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sex: string
          source?: Database["public"]["Enums"]["registry_source"]
          status?: Database["public"]["Enums"]["registry_status"]
          updated_at?: string
          user_id?: string | null
          applicant_type?: string
          chk_disability?: boolean
          chk_name_dob?: boolean
          chk_photo_match?: boolean
          chk_representative?: boolean
          chk_residency?: boolean
          id_expiry?: string | null
          rep_contact_number?: string | null
          rep_full_name?: string | null
          rep_relationship?: string | null
        }
        Update: {
          address?: string
          birth_date?: string
          category?: Database["public"]["Enums"]["registry_category"]
          civil_status?: string | null
          contact_number?: string | null
          created_at?: string
          disability_type?: string | null
          encoded_by?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          pension_applicant?: boolean
          receives_other_pension?: boolean
          reference_code?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sex?: string
          source?: Database["public"]["Enums"]["registry_source"]
          status?: Database["public"]["Enums"]["registry_status"]
          updated_at?: string
          user_id?: string | null
          applicant_type?: string
          chk_disability?: boolean
          chk_name_dob?: boolean
          chk_photo_match?: boolean
          chk_representative?: boolean
          chk_residency?: boolean
          id_expiry?: string | null
          rep_contact_number?: string | null
          rep_full_name?: string | null
          rep_relationship?: string | null
        }
        Relationships: []
      }
      registrant_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          id: string
          mime_type: string
          note: string | null
          registrant_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name: string
          id?: string
          mime_type: string
          note?: string | null
          registrant_id: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          id?: string
          mime_type?: string
          note?: string | null
          registrant_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      registry_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: string | null
          id: string
          registrant_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: string | null
          id?: string
          registrant_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: string | null
          id?: string
          registrant_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      court_slot_status: {
        Args: { p_date: string; p_slot: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      registrant_blockers: {
        Args: { _registrant_id: string }
        Returns: string[]
      }
      senior_gift_amount: {
        Args: { _age: number }
        Returns: number | null
      }
      track_registration: {
        Args: { _code: string; _year?: number }
        Returns: {
          benefit_year: number
          category: Database["public"]["Enums"]["registry_category"]
          incentives: Json
          reference_code: string
          senior_gift_amount: number | null
          status: Database["public"]["Enums"]["registry_status"]
          updated_at: string
        }[]
      }
    }
    Enums: {
      account_status: "pending" | "approved" | "rejected" | "suspended"
      app_role: "admin" | "resident"
      problem_status:
        | "submitted"
        | "under_review"
        | "in_progress"
        | "resolved"
        | "rejected"
      release_status: "pending" | "approved" | "ready_for_release" | "released"
      request_status:
        | "pending"
        | "in_queue"
        | "processing"
        | "completed"
        | "rejected"
        | "cancelled"
      reservation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "completed"
      registry_category: "pwd" | "senior"
      registry_source: "online" | "walk_in"
      registry_status: "pending" | "approved" | "rejected"
      registry_release_status: "scheduled" | "released" | "unclaimed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_status: ["pending", "approved", "rejected", "suspended"],
      app_role: ["admin", "resident"],
      problem_status: [
        "submitted",
        "under_review",
        "in_progress",
        "resolved",
        "rejected",
      ],
      release_status: ["pending", "approved", "ready_for_release", "released"],
      registry_category: ["pwd", "senior"],
      registry_source: ["online", "walk_in"],
      registry_status: ["pending", "approved", "rejected"],
      registry_release_status: ["scheduled", "released", "unclaimed"],
      request_status: [
        "pending",
        "in_queue",
        "processing",
        "completed",
        "rejected",
        "cancelled",
      ],
      reservation_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "completed",
      ],
    },
  },
} as const
