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
    PostgrestVersion: "14.4"
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
      accounts: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          public_data: Json
          slug: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_personal_account?: boolean
          name: string
          picture_url?: string | null
          primary_owner_user_id?: string
          public_data?: Json
          slug?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_personal_account?: boolean
          name?: string
          picture_url?: string | null
          primary_owner_user_id?: string
          public_data?: Json
          slug?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      accounts_memberships: {
        Row: {
          account_id: string
          account_role: string
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_role: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_role?: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_role_fkey"
            columns: ["account_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      ai_request_logs: {
        Row: {
          created_at: string
          feature: string
          id: string
          prompt_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          prompt_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          prompt_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_request_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          facility_id: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data: Json
          expires_at: string
          facility_id: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          facility_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_cache_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          patient_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          patient_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          patient_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          channels: string[]
          created_at: string
          created_by: string
          facility_id: string
          id: string
          message: string
          recipient_count: number
          sent_at: string | null
          target_audience: string
          title: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          created_by: string
          facility_id: string
          id?: string
          message: string
          recipient_count?: number
          sent_at?: string | null
          target_audience?: string
          title: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          created_by?: string
          facility_id?: string
          id?: string
          message?: string
          recipient_count?: number
          sent_at?: string | null
          target_audience?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notes: {
        Row: {
          appointment_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          tags: string[]
        }
        Insert: {
          appointment_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          tags?: string[]
        }
        Update: {
          appointment_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          ai_generated: boolean
          branch_id: string | null
          call_ended_at: string | null
          call_started_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checked_in_at: string | null
          completed_at: string | null
          created_at: string
          doctor_id: string | null
          emergency_reason: string | null
          facility_id: string | null
          follow_up_of: string | null
          for_family_member_id: string | null
          google_event_id: string | null
          id: string
          is_emergency: boolean
          needs_queue_sync: boolean
          notes: string | null
          patient_id: string | null
          patient_name: string | null
          patient_phone: string | null
          patient_summary: string | null
          payment_status: Database["public"]["Enums"]["hams_payment_status"]
          previous_slot_date: string | null
          previous_slot_start: string | null
          reason_for_visit: string | null
          reference_number: string
          requested_at: string | null
          room_token: string | null
          room_url: string | null
          slot_date: string
          slot_end: string
          slot_start: string
          status: Database["public"]["Enums"]["appointment_status"]
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          branch_id?: string | null
          call_ended_at?: string | null
          call_started_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          emergency_reason?: string | null
          facility_id?: string | null
          follow_up_of?: string | null
          for_family_member_id?: string | null
          google_event_id?: string | null
          id?: string
          is_emergency?: boolean
          needs_queue_sync?: boolean
          notes?: string | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          patient_summary?: string | null
          payment_status?: Database["public"]["Enums"]["hams_payment_status"]
          previous_slot_date?: string | null
          previous_slot_start?: string | null
          reason_for_visit?: string | null
          reference_number?: string
          requested_at?: string | null
          room_token?: string | null
          room_url?: string | null
          slot_date: string
          slot_end: string
          slot_start: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          branch_id?: string | null
          call_ended_at?: string | null
          call_started_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          emergency_reason?: string | null
          facility_id?: string | null
          follow_up_of?: string | null
          for_family_member_id?: string | null
          google_event_id?: string | null
          id?: string
          is_emergency?: boolean
          needs_queue_sync?: boolean
          notes?: string | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          patient_summary?: string | null
          payment_status?: Database["public"]["Enums"]["hams_payment_status"]
          previous_slot_date?: string | null
          previous_slot_start?: string | null
          reason_for_visit?: string | null
          reference_number?: string
          requested_at?: string | null
          room_token?: string | null
          room_url?: string | null
          slot_date?: string
          slot_end?: string
          slot_start?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_follow_up_of_fkey"
            columns: ["follow_up_of"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_for_family_member_id_fkey"
            columns: ["for_family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_ip: unknown
          actor_role: Database["public"]["Enums"]["user_role"] | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_ip?: unknown
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_ip?: unknown
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          account_id: string
          customer_id: string
          email: string | null
          id: number
          provider: Database["public"]["Enums"]["billing_provider"]
        }
        Insert: {
          account_id: string
          customer_id: string
          email?: string | null
          id?: number
          provider: Database["public"]["Enums"]["billing_provider"]
        }
        Update: {
          account_id?: string
          customer_id?: string
          email?: string | null
          id?: number
          provider?: Database["public"]["Enums"]["billing_provider"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: Json
          created_at: string
          facility_id: string
          id: string
          is_main: boolean
          location: unknown
          name: string
          phone: string | null
          working_hours: Json[]
        }
        Insert: {
          address?: Json
          created_at?: string
          facility_id: string
          id?: string
          is_main?: boolean
          location?: unknown
          name: string
          phone?: string | null
          working_hours?: Json[]
        }
        Update: {
          address?: Json
          created_at?: string
          facility_id?: string
          id?: string
          is_main?: boolean
          location?: unknown
          name?: string
          phone?: string | null
          working_hours?: Json[]
        }
        Relationships: [
          {
            foreignKeyName: "branches_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing: boolean
          enable_team_account_billing: boolean
          enable_team_accounts: boolean
        }
        Insert: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
        }
        Update: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
        }
        Relationships: []
      }
      consent_history: {
        Row: {
          changed_at: string
          consent_flags: Json
          consent_version: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          consent_flags: Json
          consent_version?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          consent_flags?: Json
          consent_version?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          is_active: boolean
          last_message: string | null
          last_message_at: string | null
          participants: string[]
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_message?: string | null
          last_message_at?: string | null
          participants?: string[]
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_message?: string | null
          last_message_at?: string | null
          participants?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          download_logged: boolean
          download_url: string | null
          expires_at: string | null
          file_size_bytes: number | null
          id: string
          retry_count: number
          status: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          download_logged?: boolean
          download_url?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          retry_count?: number
          status?: string
          storage_path?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          download_logged?: boolean
          download_url?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          retry_count?: number
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      doctor_availability: {
        Row: {
          day_of_week: number
          doctor_id: string
          id: string
          slots: Json
        }
        Insert: {
          day_of_week: number
          doctor_id: string
          id?: string
          slots?: Json
        }
        Update: {
          day_of_week?: number
          doctor_id?: string
          id?: string
          slots?: Json
        }
        Relationships: [
          {
            foreignKeyName: "doctor_availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_documents: {
        Row: {
          deleted_at: string | null
          doc_type: Database["public"]["Enums"]["doctor_doc_type"]
          doctor_id: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string
          rejection_reason: string | null
          storage_path: string
          uploaded_at: string | null
          uploaded_by: string | null
          verification_status:
            | Database["public"]["Enums"]["doc_verification_status"]
            | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          deleted_at?: string | null
          doc_type: Database["public"]["Enums"]["doctor_doc_type"]
          doctor_id: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type: string
          rejection_reason?: string | null
          storage_path: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          verification_status?:
            | Database["public"]["Enums"]["doc_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          deleted_at?: string | null
          doc_type?: Database["public"]["Enums"]["doctor_doc_type"]
          doctor_id?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string
          rejection_reason?: string | null
          storage_path?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          verification_status?:
            | Database["public"]["Enums"]["doc_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_documents_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_onboarding: {
        Row: {
          completed_at: string | null
          created_at: string | null
          doctor_id: string | null
          id: string
          initiated_by: string | null
          license_expiry: string | null
          license_number: string | null
          license_verified: boolean | null
          license_verified_at: string | null
          license_verified_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["onboarding_status"] | null
          step_availability: boolean | null
          step_basic_info: boolean | null
          step_credentials: boolean | null
          step_documents: boolean | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          id?: string
          initiated_by?: string | null
          license_expiry?: string | null
          license_number?: string | null
          license_verified?: boolean | null
          license_verified_at?: string | null
          license_verified_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"] | null
          step_availability?: boolean | null
          step_basic_info?: boolean | null
          step_credentials?: boolean | null
          step_documents?: boolean | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          id?: string
          initiated_by?: string | null
          license_expiry?: string | null
          license_number?: string | null
          license_verified?: boolean | null
          license_verified_at?: string | null
          license_verified_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"] | null
          step_availability?: boolean | null
          step_basic_info?: boolean | null
          step_credentials?: boolean | null
          step_documents?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_onboarding_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_onboarding_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_onboarding_license_verified_by_fkey"
            columns: ["license_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          avg_rating: number
          bio: string | null
          branch_id: string | null
          created_at: string
          facility_id: string | null
          fees: Json | null
          full_name: string
          id: string
          is_active: boolean
          languages: string[] | null
          profile_photo_url: string | null
          qualifications: string[] | null
          review_count: number
          specialty: string | null
          status: Database["public"]["Enums"]["doctor_status"]
          status_updated_at: string
          sub_specialty: string | null
          updated_at: string
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          avg_rating?: number
          bio?: string | null
          branch_id?: string | null
          created_at?: string
          facility_id?: string | null
          fees?: Json | null
          full_name: string
          id?: string
          is_active?: boolean
          languages?: string[] | null
          profile_photo_url?: string | null
          qualifications?: string[] | null
          review_count?: number
          specialty?: string | null
          status?: Database["public"]["Enums"]["doctor_status"]
          status_updated_at?: string
          sub_specialty?: string | null
          updated_at?: string
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          avg_rating?: number
          bio?: string | null
          branch_id?: string | null
          created_at?: string
          facility_id?: string | null
          fees?: Json | null
          full_name?: string
          id?: string
          is_active?: boolean
          languages?: string[] | null
          profile_photo_url?: string | null
          qualifications?: string[] | null
          review_count?: number
          specialty?: string | null
          status?: Database["public"]["Enums"]["doctor_status"]
          status_updated_at?: string
          sub_specialty?: string | null
          updated_at?: string
          user_id?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_names: {
        Row: {
          category: string | null
          generic_name: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          generic_name?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          generic_name?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      facilities: {
        Row: {
          accepted_insurances: string[]
          address: Json
          cover_photo_url: string | null
          created_at: string
          custom_type: string | null
          description: string | null
          email: string | null
          id: string
          is_verified: boolean
          location: unknown
          logo_url: string | null
          max_admins: number | null
          name: string
          phone: string | null
          rating: number
          review_count: number
          services: string[]
          status: string
          type: Database["public"]["Enums"]["facility_type"]
          updated_at: string
          website: string | null
          working_hours: Json[]
        }
        Insert: {
          accepted_insurances?: string[]
          address?: Json
          cover_photo_url?: string | null
          created_at?: string
          custom_type?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          location?: unknown
          logo_url?: string | null
          max_admins?: number | null
          name: string
          phone?: string | null
          rating?: number
          review_count?: number
          services?: string[]
          status?: string
          type?: Database["public"]["Enums"]["facility_type"]
          updated_at?: string
          website?: string | null
          working_hours?: Json[]
        }
        Update: {
          accepted_insurances?: string[]
          address?: Json
          cover_photo_url?: string | null
          created_at?: string
          custom_type?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean
          location?: unknown
          logo_url?: string | null
          max_admins?: number | null
          name?: string
          phone?: string | null
          rating?: number
          review_count?: number
          services?: string[]
          status?: string
          type?: Database["public"]["Enums"]["facility_type"]
          updated_at?: string
          website?: string | null
          working_hours?: Json[]
        }
        Relationships: []
      }
      facility_admin_invites: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          facility_id: string
          id: string
          is_used: boolean | null
          token_hash: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          facility_id: string
          id?: string
          is_used?: boolean | null
          token_hash: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          facility_id?: string
          id?: string
          is_used?: boolean | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_facility"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_admin_limit: {
        Row: {
          facility_id: string
          max_admins: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          facility_id: string
          max_admins?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          facility_id?: string
          max_admins?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facility_admin_limit_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: true
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_admin_limit_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_admins: {
        Row: {
          assigned_at: string | null
          assigned_by: string
          facility_id: string
          id: string
          is_primary: boolean | null
          permissions: Json
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by: string
          facility_id: string
          id?: string
          is_primary?: boolean | null
          permissions?: Json
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string
          facility_id?: string
          id?: string
          is_primary?: boolean | null
          permissions?: Json
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_admins_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_admins_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_members: {
        Row: {
          created_at: string | null
          facility_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          facility_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          facility_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_members_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_photos: {
        Row: {
          caption: string | null
          facility_id: string
          id: string
          sort_order: number
          uploaded_at: string
          url: string
        }
        Insert: {
          caption?: string | null
          facility_id: string
          id?: string
          sort_order?: number
          uploaded_at?: string
          url: string
        }
        Update: {
          caption?: string | null
          facility_id?: string
          id?: string
          sort_order?: number
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_photos_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_settings: {
        Row: {
          allow_online_booking: boolean
          allow_telemedicine: boolean
          avg_consultation_minutes: number
          buffer_minutes_between_appts: number
          cancellation_cutoff_hours: number
          currency: string
          facility_id: string
          id: string
          max_daily_broadcasts: number
          partial_refund_percent: number
          refund_percent: number | null
          require_prepayment: boolean
          reschedule_cutoff_hours: number
          updated_at: string
          walkin_slots_per_hour: number
        }
        Insert: {
          allow_online_booking?: boolean
          allow_telemedicine?: boolean
          avg_consultation_minutes?: number
          buffer_minutes_between_appts?: number
          cancellation_cutoff_hours?: number
          currency?: string
          facility_id: string
          id?: string
          max_daily_broadcasts?: number
          partial_refund_percent?: number
          refund_percent?: number | null
          require_prepayment?: boolean
          reschedule_cutoff_hours?: number
          updated_at?: string
          walkin_slots_per_hour?: number
        }
        Update: {
          allow_online_booking?: boolean
          allow_telemedicine?: boolean
          avg_consultation_minutes?: number
          buffer_minutes_between_appts?: number
          cancellation_cutoff_hours?: number
          currency?: string
          facility_id?: string
          id?: string
          max_daily_broadcasts?: number
          partial_refund_percent?: number
          refund_percent?: number | null
          require_prepayment?: boolean
          reschedule_cutoff_hours?: number
          updated_at?: string
          walkin_slots_per_hour?: number
        }
        Relationships: [
          {
            foreignKeyName: "facility_settings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: true
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_staff: {
        Row: {
          assigned_doctor_id: string | null
          created_at: string | null
          email: string | null
          facility_id: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role_type: Database["public"]["Enums"]["staff_role_type"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_doctor_id?: string | null
          created_at?: string | null
          email?: string | null
          facility_id: string
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_type?: Database["public"]["Enums"]["staff_role_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_doctor_id?: string | null
          created_at?: string | null
          email?: string | null
          facility_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_type?: Database["public"]["Enums"]["staff_role_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facility_staff_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_staff_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          patient_id: string
          relation: Database["public"]["Enums"]["family_relation"]
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          patient_id: string
          relation: Database["public"]["Enums"]["family_relation"]
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          patient_id?: string
          relation?: Database["public"]["Enums"]["family_relation"]
        }
        Relationships: [
          {
            foreignKeyName: "family_members_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favourites: {
        Row: {
          created_at: string
          id: string
          patient_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          facility_id: string | null
          file_url: string
          id: string
          patient_id: string | null
          period: string | null
          report_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          facility_id?: string | null
          file_url: string
          id?: string
          patient_id?: string | null
          period?: string | null
          report_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          facility_id?: string | null
          file_url?: string
          id?: string
          patient_id?: string | null
          period?: string | null
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          is_read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type_enum"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          title: string
          type?: Database["public"]["Enums"]["notification_type_enum"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type_enum"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          doctor_id: string | null
          email: string
          expires_at: string | null
          facility_id: string
          id: string
          invite_type: Database["public"]["Enums"]["invite_type"]
          invited_by: string
          invited_name: string | null
          permissions: Json | null
          revoked_at: string | null
          revoked_by: string | null
          role: string | null
          staff_id: string | null
          status: Database["public"]["Enums"]["invite_status"]
          token: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          email: string
          expires_at?: string | null
          facility_id: string
          id?: string
          invite_type: Database["public"]["Enums"]["invite_type"]
          invited_by: string
          invited_name?: string | null
          permissions?: Json | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string | null
          staff_id?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          doctor_id?: string | null
          email?: string
          expires_at?: string | null
          facility_id?: string
          id?: string
          invite_type?: Database["public"]["Enums"]["invite_type"]
          invited_by?: string
          invited_name?: string | null
          permissions?: Json | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string | null
          staff_id?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "facility_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_result_analytes: {
        Row: {
          analyte_code: string
          analyte_name: string
          created_at: string
          display_order: number
          flag: Database["public"]["Enums"]["lab_flag"]
          id: string
          lab_result_id: string
          measured_at: string
          patient_id: string
          reference_high: number | null
          reference_low: number | null
          reference_text: string | null
          unit: string | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          analyte_code: string
          analyte_name: string
          created_at?: string
          display_order?: number
          flag?: Database["public"]["Enums"]["lab_flag"]
          id?: string
          lab_result_id: string
          measured_at?: string
          patient_id: string
          reference_high?: number | null
          reference_low?: number | null
          reference_text?: string | null
          unit?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          analyte_code?: string
          analyte_name?: string
          created_at?: string
          display_order?: number
          flag?: Database["public"]["Enums"]["lab_flag"]
          id?: string
          lab_result_id?: string
          measured_at?: string
          patient_id?: string
          reference_high?: number | null
          reference_low?: number | null
          reference_text?: string | null
          unit?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_result_analytes_lab_result_id_fkey"
            columns: ["lab_result_id"]
            isOneToOne: false
            referencedRelation: "lab_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_result_analytes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          ai_insight: string | null
          ai_insight_at: string | null
          appointment_id: string | null
          facility_id: string
          file_type: string
          file_url: string
          flagged_count: number
          id: string
          is_viewed: boolean
          notes: string | null
          patient_id: string
          result_date: string | null
          status: Database["public"]["Enums"]["lab_result_status"]
          storage_path: string | null
          test_name: string
          uploaded_at: string
          uploaded_by: string
          viewed_at: string | null
        }
        Insert: {
          ai_insight?: string | null
          ai_insight_at?: string | null
          appointment_id?: string | null
          facility_id: string
          file_type: string
          file_url: string
          flagged_count?: number
          id?: string
          is_viewed?: boolean
          notes?: string | null
          patient_id: string
          result_date?: string | null
          status?: Database["public"]["Enums"]["lab_result_status"]
          storage_path?: string | null
          test_name: string
          uploaded_at?: string
          uploaded_by: string
          viewed_at?: string | null
        }
        Update: {
          ai_insight?: string | null
          ai_insight_at?: string | null
          appointment_id?: string | null
          facility_id?: string
          file_type?: string
          file_url?: string
          flagged_count?: number
          id?: string
          is_viewed?: boolean
          notes?: string | null
          patient_id?: string
          result_date?: string | null
          status?: Database["public"]["Enums"]["lab_result_status"]
          storage_path?: string | null
          test_name?: string
          uploaded_at?: string
          uploaded_by?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_histories: {
        Row: {
          allergies: string[]
          conditions: string[]
          id: string
          medications: string[]
          notes: string | null
          patient_id: string
          smoking_status: Database["public"]["Enums"]["smoking_status"]
          surgeries: string[]
          updated_at: string
        }
        Insert: {
          allergies?: string[]
          conditions?: string[]
          id?: string
          medications?: string[]
          notes?: string | null
          patient_id: string
          smoking_status?: Database["public"]["Enums"]["smoking_status"]
          surgeries?: string[]
          updated_at?: string
        }
        Update: {
          allergies?: string[]
          conditions?: string[]
          id?: string
          medications?: string[]
          notes?: string | null
          patient_id?: string
          smoking_status?: Database["public"]["Enums"]["smoking_status"]
          surgeries?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_histories_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          content: string
          conversation_id: string
          id: string
          is_read: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
          sent_at: string
        }
        Insert: {
          attachment_url?: string | null
          content: string
          conversation_id: string
          id?: string
          is_read?: boolean
          sender_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
          sent_at?: string
        }
        Update: {
          attachment_url?: string | null
          content?: string
          conversation_id?: string
          id?: string
          is_read?: boolean
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["user_role"]
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_requests: {
        Row: {
          flagged_at: string
          flagged_by: string
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          review_id: string
          status: string
        }
        Insert: {
          flagged_at?: string
          flagged_by: string
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_id: string
          status?: string
        }
        Update: {
          flagged_at?: string
          flagged_by?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_requests_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_requests_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      muted_facilities: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          patient_id: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          patient_id: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "muted_facilities_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muted_facilities_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nonces: {
        Row: {
          client_token: string
          created_at: string
          expires_at: string
          id: string
          last_verification_at: string | null
          last_verification_ip: unknown
          last_verification_user_agent: string | null
          metadata: Json | null
          nonce: string
          purpose: string
          revoked: boolean
          revoked_reason: string | null
          scopes: string[] | null
          used_at: string | null
          user_id: string | null
          verification_attempts: number
        }
        Insert: {
          client_token: string
          created_at?: string
          expires_at: string
          id?: string
          last_verification_at?: string | null
          last_verification_ip?: unknown
          last_verification_user_agent?: string | null
          metadata?: Json | null
          nonce: string
          purpose: string
          revoked?: boolean
          revoked_reason?: string | null
          scopes?: string[] | null
          used_at?: string | null
          user_id?: string | null
          verification_attempts?: number
        }
        Update: {
          client_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_verification_at?: string | null
          last_verification_ip?: unknown
          last_verification_user_agent?: string | null
          metadata?: Json | null
          nonce?: string
          purpose?: string
          revoked?: boolean
          revoked_reason?: string | null
          scopes?: string[] | null
          used_at?: string | null
          user_id?: string | null
          verification_attempts?: number
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          appointment_id: string | null
          body: string
          channel: Database["public"]["Enums"]["hams_notification_channel"]
          created_at: string
          error: string | null
          id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["hams_notification_status"]
          title: string | null
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          body: string
          channel: Database["public"]["Enums"]["hams_notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["hams_notification_status"]
          title?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          body?: string
          channel?: Database["public"]["Enums"]["hams_notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["hams_notification_status"]
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          categories: Json
          email: boolean
          push: boolean
          sms: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          email?: boolean
          push?: boolean
          sms?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          email?: boolean
          push?: boolean
          sms?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          account_id: string
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dismissed: boolean
          expires_at: string | null
          id: number
          link: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          account_id: string
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dismissed?: boolean
          expires_at?: string | null
          id?: never
          link?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          account_id?: string
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dismissed?: boolean
          expires_at?: string | null
          id?: never
          link?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_amount: number | null
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          order_id: string
          price_amount?: number | null
          product_id: string
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_amount?: number | null
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at?: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          billing_customer_id?: number
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          created_at?: string
          currency?: string
          id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_records: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          hash: string
          id: string
          locked_until: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          hash: string
          id?: string
          locked_until?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          hash?: string
          id?: string
          locked_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      patient_documents: {
        Row: {
          deleted_at: string | null
          file_size_bytes: number | null
          file_type: string
          file_url: string
          id: string
          linked_appointment_id: string | null
          name: string
          patient_id: string
          storage_path: string | null
          type: Database["public"]["Enums"]["document_type"]
          uploaded_at: string
        }
        Insert: {
          deleted_at?: string | null
          file_size_bytes?: number | null
          file_type: string
          file_url: string
          id?: string
          linked_appointment_id?: string | null
          name: string
          patient_id: string
          storage_path?: string | null
          type?: Database["public"]["Enums"]["document_type"]
          uploaded_at?: string
        }
        Update: {
          deleted_at?: string | null
          file_size_bytes?: number | null
          file_type?: string
          file_url?: string
          id?: string
          linked_appointment_id?: string | null
          name?: string
          patient_id?: string
          storage_path?: string | null
          type?: Database["public"]["Enums"]["document_type"]
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_appointment_fk"
            columns: ["linked_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_insurance: {
        Row: {
          card_photo_url: string | null
          coverage_type: string | null
          created_at: string
          expiry_date: string | null
          id: string
          is_active: boolean
          member_id: string
          patient_id: string
          policy_number: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          card_photo_url?: string | null
          coverage_type?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          member_id: string
          patient_id: string
          policy_number?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          card_photo_url?: string | null
          coverage_type?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          member_id?: string
          patient_id?: string
          policy_number?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_insurance_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_profiles: {
        Row: {
          address: Json | null
          blood_group: Database["public"]["Enums"]["blood_group_type"]
          created_at: string
          date_of_birth: string | null
          emergency_contact: Json | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          profile_photo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: Json | null
          blood_group?: Database["public"]["Enums"]["blood_group_type"]
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: Json | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          profile_photo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: Json | null
          blood_group?: Database["public"]["Enums"]["blood_group_type"]
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: Json | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          profile_photo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string
          created_at: string
          currency: string
          facility_id: string
          gateway: string | null
          gateway_ref: string | null
          gateway_response: Json | null
          gateway_session_id: string | null
          id: string
          insurance_applied: boolean
          insurance_discount_percent: number
          insurance_provider: string | null
          invoice_number: string | null
          invoice_url: string | null
          patient_id: string
          payment_method: string | null
          status: Database["public"]["Enums"]["hams_payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id: string
          created_at?: string
          currency?: string
          facility_id: string
          gateway?: string | null
          gateway_ref?: string | null
          gateway_response?: Json | null
          gateway_session_id?: string | null
          id?: string
          insurance_applied?: boolean
          insurance_discount_percent?: number
          insurance_provider?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          patient_id: string
          payment_method?: string | null
          status?: Database["public"]["Enums"]["hams_payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string
          created_at?: string
          currency?: string
          facility_id?: string
          gateway?: string | null
          gateway_ref?: string | null
          gateway_response?: Json | null
          gateway_session_id?: string | null
          id?: string
          insurance_applied?: boolean
          insurance_discount_percent?: number
          insurance_provider?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          patient_id?: string
          payment_method?: string | null
          status?: Database["public"]["Enums"]["hams_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          facility_id: string
          id: string
          period_end: string
          period_start: string
          processed_at: string | null
          reference_number: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          facility_id: string
          id?: string
          period_end: string
          period_start: string
          processed_at?: string | null
          reference_number: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          facility_id?: string
          id?: string
          period_end?: string
          period_start?: string
          processed_at?: string | null
          reference_number?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_consultation_forms: {
        Row: {
          additional_notes: string | null
          appointment_id: string
          chief_complaint: string
          current_medications: string | null
          id: string
          relevant_history: string | null
          submitted_at: string
          symptoms_duration: string | null
        }
        Insert: {
          additional_notes?: string | null
          appointment_id: string
          chief_complaint: string
          current_medications?: string | null
          id?: string
          relevant_history?: string | null
          submitted_at?: string
          symptoms_duration?: string | null
        }
        Update: {
          additional_notes?: string | null
          appointment_id?: string
          chief_complaint?: string
          current_medications?: string | null
          id?: string
          relevant_history?: string | null
          submitted_at?: string
          symptoms_duration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_consultation_forms_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_scans: {
        Row: {
          created_at: string
          doctor_name: string | null
          id: string
          image_data: string | null
          medications: Json
          patient_id: string
          prescription_date: string | null
        }
        Insert: {
          created_at?: string
          doctor_name?: string | null
          id?: string
          image_data?: string | null
          medications?: Json
          patient_id: string
          prescription_date?: string | null
        }
        Update: {
          created_at?: string
          doctor_name?: string | null
          id?: string
          image_data?: string | null
          medications?: Json
          patient_id?: string
          prescription_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_scans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          appointment_id: string
          doctor_id: string
          id: string
          instructions: string | null
          issued_at: string
          medications: Json[]
          patient_id: string
          pdf_url: string | null
          share_token: string | null
          share_token_expires_at: string | null
        }
        Insert: {
          appointment_id: string
          doctor_id: string
          id?: string
          instructions?: string | null
          issued_at?: string
          medications?: Json[]
          patient_id: string
          pdf_url?: string | null
          share_token?: string | null
          share_token_expires_at?: string | null
        }
        Update: {
          appointment_id?: string
          doctor_id?: string
          id?: string
          instructions?: string | null
          issued_at?: string
          medications?: Json[]
          patient_id?: string
          pdf_url?: string | null
          share_token?: string | null
          share_token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_masked: boolean
          consent_flags: Json
          consent_ip: unknown
          consent_version: string | null
          consented_at: string | null
          created_at: string
          deletion_requested_at: string | null
          email: string
          export_request_count: number
          facility_id: string | null
          full_name: string
          id: string
          language: string
          last_export_at: string | null
          muted_facilities: string[] | null
          notification_prefs: Json
          phone: string | null
          phone_verified: boolean
          push_tokens: string[]
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          theme_preference: string
          two_factor_enabled: boolean
          updated_at: string
        }
        Insert: {
          auth_masked?: boolean
          consent_flags?: Json
          consent_ip?: unknown
          consent_version?: string | null
          consented_at?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email: string
          export_request_count?: number
          facility_id?: string | null
          full_name?: string
          id: string
          language?: string
          last_export_at?: string | null
          muted_facilities?: string[] | null
          notification_prefs?: Json
          phone?: string | null
          phone_verified?: boolean
          push_tokens?: string[]
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          theme_preference?: string
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Update: {
          auth_masked?: boolean
          consent_flags?: Json
          consent_ip?: unknown
          consent_version?: string | null
          consented_at?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string
          export_request_count?: number
          facility_id?: string | null
          full_name?: string
          id?: string
          language?: string
          last_export_at?: string | null
          muted_facilities?: string[] | null
          notification_prefs?: Json
          phone?: string | null
          phone_verified?: boolean
          push_tokens?: string[]
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          theme_preference?: string
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_items: {
        Row: {
          appointment_id: string | null
          branch_id: string | null
          called_at: string | null
          called_by_staff_id: string | null
          checked_in_at: string
          created_at: string
          created_by_staff_id: string | null
          doctor_id: string | null
          done_at: string | null
          facility_id: string
          id: string
          is_online: boolean
          is_walkin: boolean
          patient_name: string
          patient_phone: string | null
          position: number
          status: Database["public"]["Enums"]["queue_status"]
        }
        Insert: {
          appointment_id?: string | null
          branch_id?: string | null
          called_at?: string | null
          called_by_staff_id?: string | null
          checked_in_at?: string
          created_at?: string
          created_by_staff_id?: string | null
          doctor_id?: string | null
          done_at?: string | null
          facility_id: string
          id?: string
          is_online?: boolean
          is_walkin?: boolean
          patient_name: string
          patient_phone?: string | null
          position?: number
          status?: Database["public"]["Enums"]["queue_status"]
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string | null
          called_at?: string | null
          called_by_staff_id?: string | null
          checked_in_at?: string
          created_at?: string
          created_by_staff_id?: string | null
          doctor_id?: string | null
          done_at?: string | null
          facility_id?: string
          id?: string
          is_online?: boolean
          is_walkin?: boolean
          patient_name?: string
          patient_phone?: string | null
          position?: number
          status?: Database["public"]["Enums"]["queue_status"]
        }
        Relationships: [
          {
            foreignKeyName: "queue_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_called_by_staff_id_fkey"
            columns: ["called_by_staff_id"]
            isOneToOne: false
            referencedRelation: "facility_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "facility_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          cancelled_by: string | null
          created_at: string
          facility_id: string | null
          gateway_refund_ref: string | null
          gateway_response: Json | null
          id: string
          payment_id: string
          processed_at: string | null
          reason: string
          status: Database["public"]["Enums"]["refund_status"]
        }
        Insert: {
          amount: number
          cancelled_by?: string | null
          created_at?: string
          facility_id?: string | null
          gateway_refund_ref?: string | null
          gateway_response?: Json | null
          id?: string
          payment_id: string
          processed_at?: string | null
          reason: string
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Update: {
          amount?: number
          cancelled_by?: string | null
          created_at?: string
          facility_id?: string | null
          gateway_refund_ref?: string | null
          gateway_response?: Json | null
          id?: string
          payment_id?: string
          processed_at?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refunds_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_fk"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string | null
          comment: string | null
          created_at: string
          id: string
          is_visible: boolean
          patient_id: string
          rating: number
          reply: Json | null
          review_text: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["review_target"]
        }
        Insert: {
          appointment_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          patient_id: string
          rating: number
          reply?: Json | null
          review_text?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["review_target"]
        }
        Update: {
          appointment_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          patient_id?: string
          rating?: number
          reply?: Json | null
          review_text?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["review_target"]
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_fk"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          id: number
          permission: Database["public"]["Enums"]["app_permissions"]
          role: string
        }
        Insert: {
          id?: number
          permission: Database["public"]["Enums"]["app_permissions"]
          role: string
        }
        Update: {
          id?: number
          permission?: Database["public"]["Enums"]["app_permissions"]
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      roles: {
        Row: {
          hierarchy_level: number
          name: string
        }
        Insert: {
          hierarchy_level: number
          name: string
        }
        Update: {
          hierarchy_level?: number
          name?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      specialties: {
        Row: {
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      subscription_items: {
        Row: {
          created_at: string
          id: string
          interval: string
          interval_count: number
          price_amount: number | null
          product_id: string
          quantity: number
          subscription_id: string
          type: Database["public"]["Enums"]["subscription_item_type"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          interval: string
          interval_count: number
          price_amount?: number | null
          product_id: string
          quantity?: number
          subscription_id: string
          type: Database["public"]["Enums"]["subscription_item_type"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval?: string
          interval_count?: number
          price_amount?: number | null
          product_id?: string
          quantity?: number
          subscription_id?: string
          type?: Database["public"]["Enums"]["subscription_item_type"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at?: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          billing_customer_id?: number
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          id?: string
          period_ends_at?: string
          period_starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      symptom_check_logs: {
        Row: {
          conditions: string[] | null
          created_at: string
          id: string
          patient_age: number | null
          patient_gender: string | null
          symptoms: string
          urgency: string | null
        }
        Insert: {
          conditions?: string[] | null
          created_at?: string
          id?: string
          patient_age?: number | null
          patient_gender?: string | null
          symptoms: string
          urgency?: string | null
        }
        Update: {
          conditions?: string[] | null
          created_at?: string
          id?: string
          patient_age?: number | null
          patient_gender?: string | null
          symptoms?: string
          urgency?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_onboarding: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          status: string
          technician_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          technician_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_onboarding_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: true
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          bio: string | null
          branch_id: string | null
          certifications: string | null
          created_at: string
          email: string | null
          facility_id: string
          full_name: string
          id: string
          is_active: boolean
          license_expiry: string | null
          license_number: string | null
          phone: string | null
          profile_photo_url: string | null
          qualifications: string[] | null
          specialization: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          branch_id?: string | null
          certifications?: string | null
          created_at?: string
          email?: string | null
          facility_id: string
          full_name: string
          id?: string
          is_active?: boolean
          license_expiry?: string | null
          license_number?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          qualifications?: string[] | null
          specialization?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          branch_id?: string | null
          certifications?: string | null
          created_at?: string
          email?: string | null
          facility_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          license_expiry?: string | null
          license_number?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          qualifications?: string[] | null
          specialization?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technicians_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technicians_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technicians_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      two_factor_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "two_factor_recovery_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      two_factor_secrets: {
        Row: {
          created_at: string
          enabled_at: string
          encrypted_secret: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled_at?: string
          encrypted_secret: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled_at?: string
          encrypted_secret?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "two_factor_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string | null
          facility_id: string | null
          id: string
          message: string | null
          read: boolean | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          facility_id?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          facility_id?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          created_at: string
          doctor_id: string
          expires_at: string | null
          facility_id: string
          id: string
          offered_at: string | null
          offered_slot: Json | null
          patient_id: string
          position: number
          preferred_date: string
          status: Database["public"]["Enums"]["waitlist_status"]
        }
        Insert: {
          created_at?: string
          doctor_id: string
          expires_at?: string | null
          facility_id: string
          id?: string
          offered_at?: string | null
          offered_slot?: Json | null
          patient_id: string
          position?: number
          preferred_date: string
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Update: {
          created_at?: string
          doctor_id?: string
          expires_at?: string | null
          facility_id?: string
          id?: string
          offered_at?: string | null
          offered_slot?: Json | null
          patient_id?: string
          position?: number
          preferred_date?: string
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      user_account_workspace: {
        Row: {
          id: string | null
          name: string | null
          picture_url: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
        }
        Relationships: []
      }
      user_accounts: {
        Row: {
          id: string | null
          name: string | null
          picture_url: string | null
          role: string | null
          slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_memberships_account_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
    }
    Functions: {
      _owns_appointment: { Args: { p_id: string }; Returns: boolean }
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      aal2_or_no_2fa: { Args: never; Returns: boolean }
      accept_doctor_invite: {
        Args: { p_token_hash: string }
        Returns: {
          error: string
          success: boolean
        }[]
      }
      accept_facility_admin_invite: {
        Args: { p_token_hash: string }
        Returns: {
          error: string
          success: boolean
        }[]
      }
      accept_invitation: {
        Args: { token: string; user_id: string }
        Returns: string
      }
      add_walkin_to_queue: {
        Args: {
          p_created_by_staff_id?: string
          p_doctor_id: string
          p_facility_id: string
          p_patient_name: string
          p_patient_phone: string
          p_slot_duration_mins?: number
        }
        Returns: Json
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      analytics_summary: {
        Args: { p_facility_id: string; p_period?: string }
        Returns: Json
      }
      book_appointment: {
        Args: {
          p_doctor_id: string
          p_facility_id: string
          p_notes?: string
          p_patient_id: string
          p_slot_date: string
          p_slot_end: string
          p_slot_start: string
          p_type: Database["public"]["Enums"]["appointment_type"]
        }
        Returns: Json
      }
      book_appointment_atomic: {
        Args: {
          p_doctor_id: string
          p_facility_id: string
          p_for_family_member_id?: string
          p_is_emergency?: boolean
          p_patient_id: string
          p_slot_date: string
          p_slot_start: string
          p_type?: string
        }
        Returns: Json
      }
      can_action_account_member: {
        Args: { target_team_account_id: string; target_user_id: string }
        Returns: boolean
      }
      cancel_appointment: {
        Args: { p_id: string; p_user_id: string }
        Returns: Json
      }
      cancel_appointment_safe: {
        Args: {
          p_id: string
          p_reason?: string
          p_skip_cutoff?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      cancel_my_appointment: {
        Args: { p_id: string; p_reason?: string }
        Returns: Json
      }
      checkin_and_enqueue: {
        Args: {
          p_appointment_id: string
          p_patient_name: string
          p_patient_phone: string
        }
        Returns: Json
      }
      checkin_my_appointment: {
        Args: { p_id: string; p_patient_name: string; p_patient_phone: string }
        Returns: Json
      }
      claim_waitlist_appointment: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      create_branch_with_location: {
        Args: {
          address?: Json
          branch_name: string
          facility_uuid: string
          lat: number
          lng: number
          phone?: string
        }
        Returns: {
          address: Json
          created_at: string
          facility_id: string
          id: string
          is_main: boolean
          location: unknown
          name: string
          phone: string | null
          working_hours: Json[]
        }
        SetofOptions: {
          from: "*"
          to: "branches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_doctor_record: {
        Args: {
          p_email: string
          p_facility_id: string
          p_fees: Json
          p_full_name: string
          p_license_expiry: string
          p_license_number: string
          p_qualifications: string[]
          p_specialty: string
        }
        Returns: {
          doctor_id: string
          error: string
          onboarding_id: string
        }[]
      }
      create_emergency_appointment:
        | {
            Args: {
              p_doctor_id: string
              p_facility_id: string
              p_patient_id: string
              p_reason: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_doctor_id: string
              p_facility_id: string
              p_for_family_member_id?: string
              p_patient_id: string
              p_reason: string
            }
            Returns: Json
          }
      create_nonce: {
        Args: {
          p_expires_in_seconds?: number
          p_metadata?: Json
          p_purpose?: string
          p_revoke_previous?: boolean
          p_scopes?: string[]
          p_user_id?: string
        }
        Returns: Json
      }
      create_team_account: {
        Args: { account_name: string; account_slug?: string; user_id: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          public_data: Json
          slug: string | null
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_appointment: {
        Args: {
          p_appointment_id: string
          p_created_by_staff_id?: string
          p_doctor_id: string
          p_facility_id: string
          p_is_online?: boolean
          p_is_walkin?: boolean
          p_patient_name: string
          p_patient_phone: string
        }
        Returns: Json
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      expire_waitlist_entries: { Args: never; Returns: undefined }
      generate_payouts: { Args: never; Returns: undefined }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_account_invitations: {
        Args: { account_slug: string }
        Returns: {
          account_id: string
          created_at: string
          email: string
          expires_at: string
          id: number
          invited_by: string
          inviter_email: string
          inviter_name: string
          role: string
          updated_at: string
        }[]
      }
      get_account_members: {
        Args: { account_slug: string }
        Returns: {
          account_id: string
          created_at: string
          email: string
          id: string
          name: string
          picture_url: string
          primary_owner_user_id: string
          role: string
          role_hierarchy_level: number
          updated_at: string
          user_id: string
        }[]
      }
      get_available_slots: {
        Args: {
          p_date: string
          p_doctor_id: string
          p_include_walkin?: boolean
        }
        Returns: {
          slot_end: string
          slot_start: string
          slot_type: string
        }[]
      }
      get_config: { Args: never; Returns: Json }
      get_earnings_dashboard: {
        Args: { p_facility_id: string; p_period: string }
        Returns: Json
      }
      get_facility_branches: {
        Args: { facility_uuid: string }
        Returns: {
          address: Json
          created_at: string
          facility_id: string
          id: string
          is_main: boolean
          location: unknown
          name: string
          phone: string | null
          working_hours: Json[]
        }[]
        SetofOptions: {
          from: "*"
          to: "branches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_facility_earnings: {
        Args: { p_facility_id: string; p_period: string }
        Returns: Json
      }
      get_monthly_report_summary: {
        Args: { p_facility_id: string; p_month: number; p_year: number }
        Returns: Json
      }
      get_nearby_branches: {
        Args: { lat: number; lng: number; radius: number }
        Returns: {
          address: Json
          distance: number
          facility_id: string
          id: string
          name: string
        }[]
      }
      get_nearby_facilities: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          address: Json
          cover_photo_url: string
          distance_km: number
          id: string
          is_verified: boolean
          name: string
          phone: string
          rating: number
          review_count: number
          services: string[]
          type: string
        }[]
      }
      get_nonce_status: { Args: { p_id: string }; Returns: Json }
      get_upper_system_role: { Args: never; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      hams_audit_log: {
        Args: {
          p_action: string
          p_actor_role: string
          p_actor_user_id: string
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: undefined
      }
      has_active_subscription: {
        Args: { target_account_id: string }
        Returns: boolean
      }
      has_more_elevated_role: {
        Args: {
          role_name: string
          target_account_id: string
          target_user_id: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: {
          account_id: string
          permission_name: Database["public"]["Enums"]["app_permissions"]
          user_id: string
        }
        Returns: boolean
      }
      has_role_on_account: {
        Args: { account_id: string; account_role?: string }
        Returns: boolean
      }
      has_same_role_hierarchy_level: {
        Args: {
          role_name: string
          target_account_id: string
          target_user_id: string
        }
        Returns: boolean
      }
      invite_doctor: {
        Args: { p_doctor_id: string; p_email: string; p_token_hash: string }
        Returns: {
          error: string
          invite_id: string
        }[]
      }
      invite_facility_admin:
        | {
            Args: {
              p_account_id: string
              p_email: string
              p_facility_id: string
              p_name: string
              p_token_hash: string
            }
            Returns: {
              error: string
              invite_id: string
            }[]
          }
        | {
            Args: {
              p_email: string
              p_facility_id: string
              p_name: string
              p_token_hash: string
            }
            Returns: {
              error: string
              invite_id: string
            }[]
          }
      is_aal2: { Args: never; Returns: boolean }
      is_account_owner: { Args: { account_id: string }; Returns: boolean }
      is_account_team_member: {
        Args: { target_account_id: string }
        Returns: boolean
      }
      is_mfa_compliant: { Args: never; Returns: boolean }
      is_set: { Args: { field_name: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_team_member: {
        Args: { account_id: string; user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      nearby_branches: {
        Args: { radius_meters?: number; user_lat: number; user_lng: number }
        Returns: {
          address: Json
          created_at: string
          facility_id: string
          id: string
          is_main: boolean
          location: unknown
          name: string
          phone: string | null
          working_hours: Json[]
        }[]
        SetofOptions: {
          from: "*"
          to: "branches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      nearby_branches_with_distance: {
        Args: { radius_meters?: number; user_lat: number; user_lng: number }
        Returns: {
          address: Json
          created_at: string
          distance_meters: number
          facility_id: string
          id: string
          is_main: boolean
          location: unknown
          name: string
          phone: string
          working_hours: Json[]
        }[]
      }
      nearby_facilities: {
        Args: { lat: number; lng: number; radius: number }
        Returns: {
          accepted_insurances: string[]
          address: Json
          cover_photo_url: string | null
          created_at: string
          custom_type: string | null
          description: string | null
          email: string | null
          id: string
          is_verified: boolean
          location: unknown
          logo_url: string | null
          max_admins: number | null
          name: string
          phone: string | null
          rating: number
          review_count: number
          services: string[]
          status: string
          type: Database["public"]["Enums"]["facility_type"]
          updated_at: string
          website: string | null
          working_hours: Json[]
        }[]
        SetofOptions: {
          from: "*"
          to: "facilities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      purge_deleted_accounts: { Args: never; Returns: undefined }
      rebook_appointment: { Args: { p_original_id: string }; Returns: Json }
      reschedule_appointment: {
        Args: {
          p_id: string
          p_new_date: string
          p_new_end: string
          p_new_start: string
        }
        Returns: Json
      }
      reschedule_appointment_atomic: {
        Args: {
          p_id: string
          p_new_date: string
          p_new_end: string
          p_new_start: string
          p_skip_cutoff?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      reschedule_my_appointment: {
        Args: {
          p_id: string
          p_new_date: string
          p_new_end: string
          p_new_start: string
        }
        Returns: Json
      }
      revenue_report: {
        Args: { p_facility_id: string; p_period?: string; p_year?: number }
        Returns: Json
      }
      revoke_nonce: {
        Args: { p_id: string; p_reason?: string }
        Returns: boolean
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      staff_metrics: {
        Args: { p_doctor_id?: string; p_facility_id: string; p_period?: string }
        Returns: Json
      }
      team_account_workspace: {
        Args: { account_slug: string }
        Returns: {
          id: string
          name: string
          permissions: Database["public"]["Enums"]["app_permissions"][]
          picture_url: string
          primary_owner_user_id: string
          role: string
          role_hierarchy_level: number
          slug: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
        }[]
      }
      transfer_team_account_ownership: {
        Args: { new_owner_id: string; target_account_id: string }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_order: {
        Args: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          currency: string
          line_items: Json
          status: Database["public"]["Enums"]["payment_status"]
          target_account_id: string
          target_customer_id: string
          target_order_id: string
          total_amount: number
        }
        Returns: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_subscription: {
        Args: {
          active: boolean
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          currency: string
          line_items: Json
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          target_account_id: string
          target_customer_id: string
          target_subscription_id: string
          trial_ends_at?: string
          trial_starts_at?: string
        }
        Returns: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_slot_overlap: {
        Args: { existing_slots: Json[]; new_slots: Json[] }
        Returns: boolean
      }
      verify_nonce: {
        Args: {
          p_ip?: unknown
          p_max_verification_attempts?: number
          p_purpose: string
          p_required_scopes?: string[]
          p_token: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "deletion_pending" | "deleted"
      app_permissions:
        | "roles.manage"
        | "billing.manage"
        | "settings.manage"
        | "members.manage"
        | "invites.manage"
      appointment_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "completed"
        | "cancelled"
        | "no_show"
        | "approved"
      appointment_type: "in_person" | "online" | "walk_in"
      audit_action:
        | "login"
        | "logout"
        | "register"
        | "appointment_create"
        | "appointment_update"
        | "appointment_cancel"
        | "payment_processed"
        | "refund_initiated"
        | "refund_processed"
        | "profile_update"
        | "document_access"
        | "document_upload"
        | "document_delete"
        | "review_flagged"
        | "review_removed"
        | "review_restored"
        | "user_suspended"
        | "user_reactivated"
        | "facility_approved"
        | "facility_suspended"
        | "prescription_created"
        | "lab_result_uploaded"
        | "2fa_enabled"
        | "2fa_disabled"
        | "data_export_requested"
        | "account_deletion_requested"
        | "invitation_accepted"
        | "invitation_revoked"
        | "invitation_expired"
        | "doctor_onboarding_pending"
        | "doctor_onboarding_in_progress"
        | "doctor_onboarding_completed"
        | "facility_admin_revoked"
        | "consent_given"
        | "consent_updated"
        | "data_export_downloaded"
        | "account_deletion_cancelled"
        | "account_deletion_processed"
        | "facility_activated"
        | "facility_deactivated"
        | "facility_verified"
        | "facility_unverified"
        | "review_created"
        | "review_hidden"
        | "review_replied"
        | "doctor_created"
        | "unauthorized_access_attempt"
        | "onboarding_failed_duplicate_email"
        | "license_expired_detected"
      billing_provider: "stripe" | "lemon-squeezy" | "paddle"
      blood_group_type:
        | "A+"
        | "A-"
        | "B+"
        | "B-"
        | "AB+"
        | "AB-"
        | "O+"
        | "O-"
        | "unknown"
      doc_verification_status: "pending" | "approved" | "rejected"
      doctor_doc_type:
        | "medical_license"
        | "degree_certificate"
        | "specialization_certificate"
        | "passport"
        | "national_id"
        | "malpractice_insurance"
        | "cv"
        | "other"
      doctor_status: "available" | "with_patient" | "on_break" | "unavailable"
      document_type:
        | "prescription"
        | "report"
        | "imaging"
        | "insurance"
        | "other"
      facility_type:
        | "clinic"
        | "hospital"
        | "lab"
        | "radiology"
        | "pharmacy"
        | "dental"
        | "optical"
        | "physiotherapy"
        | "mental_health"
        | "other"
      family_relation: "spouse" | "child" | "parent" | "sibling" | "other"
      gender_type: "male" | "female" | "other" | "prefer_not_to_say"
      hams_notification_channel:
        | "sms"
        | "email"
        | "whatsapp"
        | "push"
        | "in_app"
      hams_notification_status: "pending" | "sent" | "delivered" | "failed"
      hams_payment_status:
        | "unpaid"
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partial_refund"
      invite_status: "pending" | "accepted" | "expired" | "revoked"
      invite_type: "facility_admin" | "doctor" | "technician" | "staff"
      lab_flag: "low" | "normal" | "high" | "abnormal"
      lab_result_status: "normal" | "flagged"
      notification_channel: "in_app" | "email"
      notification_type: "info" | "warning" | "error"
      notification_type_enum: "info" | "warning" | "error"
      onboarding_status:
        | "invited"
        | "basic_info"
        | "credentials"
        | "availability"
        | "documents"
        | "completed"
      payment_status: "pending" | "succeeded" | "failed"
      queue_status: "waiting" | "called" | "done" | "expired"
      refund_status:
        | "pending"
        | "processing"
        | "processed"
        | "failed"
        | "rejected"
      review_target: "doctor" | "facility"
      smoking_status: "never" | "former" | "current" | "unknown"
      staff_role_type: "receptionist" | "assistant" | "coordinator"
      subscription_item_type: "flat" | "per_seat" | "metered"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
      user_role:
        | "patient"
        | "doctor"
        | "technician"
        | "facility_admin"
        | "super_admin"
        | "staff"
      waitlist_status:
        | "waiting"
        | "offered"
        | "expired"
        | "booked"
        | "withdrawn"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      invitation: {
        email: string | null
        role: string | null
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      account_status: ["active", "suspended", "deletion_pending", "deleted"],
      app_permissions: [
        "roles.manage",
        "billing.manage",
        "settings.manage",
        "members.manage",
        "invites.manage",
      ],
      appointment_status: [
        "pending",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
        "approved",
      ],
      appointment_type: ["in_person", "online", "walk_in"],
      audit_action: [
        "login",
        "logout",
        "register",
        "appointment_create",
        "appointment_update",
        "appointment_cancel",
        "payment_processed",
        "refund_initiated",
        "refund_processed",
        "profile_update",
        "document_access",
        "document_upload",
        "document_delete",
        "review_flagged",
        "review_removed",
        "review_restored",
        "user_suspended",
        "user_reactivated",
        "facility_approved",
        "facility_suspended",
        "prescription_created",
        "lab_result_uploaded",
        "2fa_enabled",
        "2fa_disabled",
        "data_export_requested",
        "account_deletion_requested",
        "invitation_accepted",
        "invitation_revoked",
        "invitation_expired",
        "doctor_onboarding_pending",
        "doctor_onboarding_in_progress",
        "doctor_onboarding_completed",
        "facility_admin_revoked",
        "consent_given",
        "consent_updated",
        "data_export_downloaded",
        "account_deletion_cancelled",
        "account_deletion_processed",
        "facility_activated",
        "facility_deactivated",
        "facility_verified",
        "facility_unverified",
        "review_created",
        "review_hidden",
        "review_replied",
        "doctor_created",
        "unauthorized_access_attempt",
        "onboarding_failed_duplicate_email",
        "license_expired_detected",
      ],
      billing_provider: ["stripe", "lemon-squeezy", "paddle"],
      blood_group_type: [
        "A+",
        "A-",
        "B+",
        "B-",
        "AB+",
        "AB-",
        "O+",
        "O-",
        "unknown",
      ],
      doc_verification_status: ["pending", "approved", "rejected"],
      doctor_doc_type: [
        "medical_license",
        "degree_certificate",
        "specialization_certificate",
        "passport",
        "national_id",
        "malpractice_insurance",
        "cv",
        "other",
      ],
      doctor_status: ["available", "with_patient", "on_break", "unavailable"],
      document_type: [
        "prescription",
        "report",
        "imaging",
        "insurance",
        "other",
      ],
      facility_type: [
        "clinic",
        "hospital",
        "lab",
        "radiology",
        "pharmacy",
        "dental",
        "optical",
        "physiotherapy",
        "mental_health",
        "other",
      ],
      family_relation: ["spouse", "child", "parent", "sibling", "other"],
      gender_type: ["male", "female", "other", "prefer_not_to_say"],
      hams_notification_channel: ["sms", "email", "whatsapp", "push", "in_app"],
      hams_notification_status: ["pending", "sent", "delivered", "failed"],
      hams_payment_status: [
        "unpaid",
        "pending",
        "paid",
        "failed",
        "refunded",
        "partial_refund",
      ],
      invite_status: ["pending", "accepted", "expired", "revoked"],
      invite_type: ["facility_admin", "doctor", "technician", "staff"],
      lab_flag: ["low", "normal", "high", "abnormal"],
      lab_result_status: ["normal", "flagged"],
      notification_channel: ["in_app", "email"],
      notification_type: ["info", "warning", "error"],
      notification_type_enum: ["info", "warning", "error"],
      onboarding_status: [
        "invited",
        "basic_info",
        "credentials",
        "availability",
        "documents",
        "completed",
      ],
      payment_status: ["pending", "succeeded", "failed"],
      queue_status: ["waiting", "called", "done", "expired"],
      refund_status: [
        "pending",
        "processing",
        "processed",
        "failed",
        "rejected",
      ],
      review_target: ["doctor", "facility"],
      smoking_status: ["never", "former", "current", "unknown"],
      staff_role_type: ["receptionist", "assistant", "coordinator"],
      subscription_item_type: ["flat", "per_seat", "metered"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ],
      user_role: [
        "patient",
        "doctor",
        "technician",
        "facility_admin",
        "super_admin",
        "staff",
      ],
      waitlist_status: ["waiting", "offered", "expired", "booked", "withdrawn"],
    },
  },
} as const
