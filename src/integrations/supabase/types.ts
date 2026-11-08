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
      benefit_releases: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period: string | null
          registrant_id: string
          release_date: string | null
          status: Database["public"]["Enums"]["release_status"]
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
          status?: Database["public"]["Enums"]["release_status"]
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
          status?: Database["public"]["Enums"]["release_status"]
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
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }
        Returns: boolean
      }
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
      app_role: "admin" | "resident"
      registry_category: "pwd" | "senior"
      registry_source: "online" | "walk_in"
      registry_status: "pending" | "approved" | "rejected"
      release_status: "scheduled" | "released" | "unclaimed"
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
      app_role: ["admin", "resident"],
      registry_category: ["pwd", "senior"],
      registry_source: ["online", "walk_in"],
      registry_status: ["pending", "approved", "rejected"],
      release_status: ["scheduled", "released", "unclaimed"],
    },
  },
} as const
