// Mirrors the current public schema. Regenerate with `pnpm db:generate-types`
// once local Supabase is available.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          agent_uri: string | null;
          agent_uri_data: Json | null;
          created_at: string;
          created_ledger: number | null;
          id: number;
          owner: string;
          search_vector: unknown | null;
          tx_hash: string | null;
          updated_at: string;
          wallet: string | null;
        };
        Insert: {
          agent_uri?: string | null;
          agent_uri_data?: Json | null;
          created_at?: string;
          created_ledger?: number | null;
          id: number;
          owner: string;
          search_vector?: never;
          tx_hash?: string | null;
          updated_at?: string;
          wallet?: string | null;
        };
        Update: {
          agent_uri?: string | null;
          agent_uri_data?: Json | null;
          created_at?: string;
          created_ledger?: number | null;
          id?: number;
          owner?: string;
          search_vector?: never;
          tx_hash?: string | null;
          updated_at?: string;
          wallet?: string | null;
        };
        Relationships: [];
      };
      agent_metadata: {
        Row: {
          agent_id: number;
          key: string;
          value: string | null;
        };
        Insert: {
          agent_id: number;
          key: string;
          value?: string | null;
        };
        Update: {
          agent_id?: number;
          key?: string;
          value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_metadata_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          agent_id: number;
          client_address: string;
          created_at: string;
          created_ledger: number | null;
          endpoint: string | null;
          feedback_hash: string | null;
          feedback_index: number;
          feedback_uri: string | null;
          id: number;
          is_revoked: boolean;
          tag1: string | null;
          tag2: string | null;
          tx_hash: string | null;
          value: number;
          value_decimals: number;
        };
        Insert: {
          agent_id: number;
          client_address: string;
          created_at?: string;
          created_ledger?: number | null;
          endpoint?: string | null;
          feedback_hash?: string | null;
          feedback_index: number;
          feedback_uri?: string | null;
          id?: number;
          is_revoked?: boolean;
          tag1?: string | null;
          tag2?: string | null;
          tx_hash?: string | null;
          value: number;
          value_decimals?: number;
        };
        Update: {
          agent_id?: number;
          client_address?: string;
          created_at?: string;
          created_ledger?: number | null;
          endpoint?: string | null;
          feedback_hash?: string | null;
          feedback_index?: number;
          feedback_uri?: string | null;
          id?: number;
          is_revoked?: boolean;
          tag1?: string | null;
          tag2?: string | null;
          tx_hash?: string | null;
          value?: number;
          value_decimals?: number;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_responses: {
        Row: {
          agent_id: number;
          client_address: string;
          created_at: string;
          feedback_index: number;
          id: number;
          responder: string;
          response_hash: string | null;
          response_index: number;
          response_uri: string | null;
          tx_hash: string | null;
        };
        Insert: {
          agent_id: number;
          client_address: string;
          created_at?: string;
          feedback_index: number;
          id?: number;
          responder: string;
          response_hash?: string | null;
          response_index: number;
          response_uri?: string | null;
          tx_hash?: string | null;
        };
        Update: {
          agent_id?: number;
          client_address?: string;
          created_at?: string;
          feedback_index?: number;
          id?: number;
          responder?: string;
          response_hash?: string | null;
          response_index?: number;
          response_uri?: string | null;
          tx_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_responses_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      indexer_state: {
        Row: {
          id: string;
          last_cursor: string | null;
          last_ledger: number;
          updated_at: string;
        };
        Insert: {
          id: string;
          last_cursor?: string | null;
          last_ledger?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          last_cursor?: string | null;
          last_ledger?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      validations: {
        Row: {
          agent_id: number;
          created_at: string;
          has_response: boolean;
          request_hash: string;
          request_tx_hash: string | null;
          request_uri: string | null;
          responded_at: string | null;
          response: number | null;
          response_hash: string | null;
          response_tx_hash: string | null;
          response_uri: string | null;
          tag: string | null;
          validator_address: string;
        };
        Insert: {
          agent_id: number;
          created_at?: string;
          has_response?: boolean;
          request_hash: string;
          request_tx_hash?: string | null;
          request_uri?: string | null;
          responded_at?: string | null;
          response?: number | null;
          response_hash?: string | null;
          response_tx_hash?: string | null;
          response_uri?: string | null;
          tag?: string | null;
          validator_address: string;
        };
        Update: {
          agent_id?: number;
          created_at?: string;
          has_response?: boolean;
          request_hash?: string;
          request_tx_hash?: string | null;
          request_uri?: string | null;
          responded_at?: string | null;
          response?: number | null;
          response_hash?: string | null;
          response_tx_hash?: string | null;
          response_uri?: string | null;
          tag?: string | null;
          validator_address?: string;
        };
        Relationships: [
          {
            foreignKeyName: "validations_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      leaderboard_scores: {
        Row: {
          agent_id: number | null;
          agent_image: string | null;
          agent_name: string | null;
          avg_score: number | null;
          avg_validation_score: number | null;
          feedback_count: number | null;
          owner: string | null;
          total_score: number | null;
          unique_clients: number | null;
          validation_count: number | null;
        };
      };
    };
    Functions: {
      refresh_leaderboard: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      search_agents: {
        Args: {
          result_limit?: number;
          result_offset?: number;
          search_query: string;
        };
        Returns: Database["public"]["Tables"]["agents"]["Row"][];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
