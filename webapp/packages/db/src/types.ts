export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      agent_metadata: {
        Row: {
          agent_id: number
          key: string
          value: string | null
        }
        Insert: {
          agent_id: number
          key: string
          value?: string | null
        }
        Update: {
          agent_id?: number
          key?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_metadata_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_metadata_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_scores"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_uri: string | null
          agent_uri_data: Json | null
          created_at: string
          created_ledger: number | null
          id: number
          owner: string
          resolve_uri_pending: boolean
          search_vector: unknown
          services: Json
          supported_trust: string[]
          tx_hash: string | null
          updated_at: string
          uri_resolve_attempts: number
          wallet: string | null
          x402_enabled: boolean
        }
        Insert: {
          agent_uri?: string | null
          agent_uri_data?: Json | null
          created_at?: string
          created_ledger?: number | null
          id: number
          owner: string
          resolve_uri_pending?: boolean
          search_vector?: unknown
          services?: Json
          supported_trust?: string[]
          tx_hash?: string | null
          updated_at?: string
          uri_resolve_attempts?: number
          wallet?: string | null
          x402_enabled?: boolean
        }
        Update: {
          agent_uri?: string | null
          agent_uri_data?: Json | null
          created_at?: string
          created_ledger?: number | null
          id?: number
          owner?: string
          resolve_uri_pending?: boolean
          search_vector?: unknown
          services?: Json
          supported_trust?: string[]
          tx_hash?: string | null
          updated_at?: string
          uri_resolve_attempts?: number
          wallet?: string | null
          x402_enabled?: boolean
        }
        Relationships: []
      }
      feedback: {
        Row: {
          agent_id: number
          client_address: string
          created_at: string
          created_ledger: number | null
          endpoint: string | null
          feedback_hash: string | null
          feedback_index: number
          feedback_uri: string | null
          id: number
          is_revoked: boolean
          tag1: string | null
          tag2: string | null
          tx_hash: string | null
          value: number
          value_decimals: number
        }
        Insert: {
          agent_id: number
          client_address: string
          created_at?: string
          created_ledger?: number | null
          endpoint?: string | null
          feedback_hash?: string | null
          feedback_index: number
          feedback_uri?: string | null
          id?: never
          is_revoked?: boolean
          tag1?: string | null
          tag2?: string | null
          tx_hash?: string | null
          value: number
          value_decimals?: number
        }
        Update: {
          agent_id?: number
          client_address?: string
          created_at?: string
          created_ledger?: number | null
          endpoint?: string | null
          feedback_hash?: string | null
          feedback_index?: number
          feedback_uri?: string | null
          id?: never
          is_revoked?: boolean
          tag1?: string | null
          tag2?: string | null
          tx_hash?: string | null
          value?: number
          value_decimals?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_scores"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      feedback_responses: {
        Row: {
          agent_id: number
          client_address: string
          created_at: string
          feedback_index: number
          id: number
          responder: string
          response_hash: string | null
          response_index: number
          response_uri: string | null
          tx_hash: string | null
        }
        Insert: {
          agent_id: number
          client_address: string
          created_at?: string
          feedback_index: number
          id?: never
          responder: string
          response_hash?: string | null
          response_index: number
          response_uri?: string | null
          tx_hash?: string | null
        }
        Update: {
          agent_id?: number
          client_address?: string
          created_at?: string
          feedback_index?: number
          id?: never
          responder?: string
          response_hash?: string | null
          response_index?: number
          response_uri?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_agent_id_client_address_feedback_index_fkey"
            columns: ["agent_id", "client_address", "feedback_index"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["agent_id", "client_address", "feedback_index"]
          },
          {
            foreignKeyName: "feedback_responses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_scores"
            referencedColumns: ["agent_id"]
          },
        ]
      }
      indexer_locks: {
        Row: {
          acquired_at: string
          lock_name: string
        }
        Insert: {
          acquired_at?: string
          lock_name: string
        }
        Update: {
          acquired_at?: string
          lock_name?: string
        }
        Relationships: []
      }
      indexer_state: {
        Row: {
          expected_next_ledger: number | null
          id: string
          last_cursor: string | null
          last_ledger: number
          updated_at: string
        }
        Insert: {
          expected_next_ledger?: number | null
          id: string
          last_cursor?: string | null
          last_ledger?: number
          updated_at?: string
        }
        Update: {
          expected_next_ledger?: number | null
          id?: string
          last_cursor?: string | null
          last_ledger?: number
          updated_at?: string
        }
        Relationships: []
      }
      validations: {
        Row: {
          agent_id: number
          created_at: string
          has_response: boolean
          request_hash: string
          request_tx_hash: string | null
          request_uri: string | null
          responded_at: string | null
          response: number | null
          response_hash: string | null
          response_tx_hash: string | null
          response_uri: string | null
          tag: string | null
          validator_address: string
        }
        Insert: {
          agent_id: number
          created_at?: string
          has_response?: boolean
          request_hash: string
          request_tx_hash?: string | null
          request_uri?: string | null
          responded_at?: string | null
          response?: number | null
          response_hash?: string | null
          response_tx_hash?: string | null
          response_uri?: string | null
          tag?: string | null
          validator_address: string
        }
        Update: {
          agent_id?: number
          created_at?: string
          has_response?: boolean
          request_hash?: string
          request_tx_hash?: string | null
          request_uri?: string | null
          responded_at?: string | null
          response?: number | null
          response_hash?: string | null
          response_tx_hash?: string | null
          response_uri?: string | null
          tag?: string | null
          validator_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "validations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_scores"
            referencedColumns: ["agent_id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_scores: {
        Row: {
          agent_id: number | null
          agent_image: string | null
          agent_name: string | null
          avg_score: number | null
          avg_validation_score: number | null
          feedback_count: number | null
          has_services: boolean | null
          owner: string | null
          supported_trust: string[] | null
          total_score: number | null
          unique_clients: number | null
          validation_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_indexer_lock: { Args: never; Returns: boolean }
      insert_feedback_response: {
        Args: {
          p_agent_id: number
          p_client_address: string
          p_created_at: string
          p_feedback_index: number
          p_responder: string
          p_response_hash: string
          p_response_uri: string
          p_tx_hash: string
        }
        Returns: number
      }
      refresh_leaderboard: { Args: never; Returns: undefined }
      release_indexer_lock: { Args: never; Returns: undefined }
      search_agents: {
        Args: {
          result_limit?: number
          result_offset?: number
          search_query: string
        }
        Returns: {
          agent_uri: string | null
          agent_uri_data: Json | null
          created_at: string
          created_ledger: number | null
          id: number
          owner: string
          resolve_uri_pending: boolean
          search_vector: unknown
          services: Json
          supported_trust: string[]
          tx_hash: string | null
          updated_at: string
          uri_resolve_attempts: number
          wallet: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "agents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_agents_advanced: {
        Args: {
          has_services_filter?: boolean
          min_score?: number
          result_limit?: number
          result_offset?: number
          search_query?: string
          trust_filter?: string[]
        }
        Returns: {
          agent_id: number
          agent_image: string
          agent_name: string
          avg_score: number
          avg_validation_score: number
          feedback_count: number
          has_services: boolean
          owner: string
          supported_trust: string[]
          total_score: number
          unique_clients: number
          validation_count: number
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

