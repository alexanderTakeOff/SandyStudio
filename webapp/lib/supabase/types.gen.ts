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
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor: string | null
          asset_id: string | null
          created_at: string
          description: string | null
          episode_id: string | null
          event_type: string
          id: string
          job_id: string | null
          metadata: Json | null
          resolved_at: string | null
          severity: string
          title: string
        }
        Insert: {
          actor?: string | null
          asset_id?: string | null
          created_at?: string
          description?: string | null
          episode_id?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          actor?: string | null
          asset_id?: string | null
          created_at?: string
          description?: string | null
          episode_id?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompts: {
        Row: {
          agent_id: string
          id: string
          prompt_md: string
          source: string
          source_path: string
          synced_at: string
          version: number
        }
        Insert: {
          agent_id: string
          id?: string
          prompt_md: string
          source?: string
          source_path: string
          synced_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          id?: string
          prompt_md?: string
          source?: string
          source_path?: string
          synced_at?: string
          version?: number
        }
        Relationships: []
      }
      analytics_reports: {
        Row: {
          collected_at: string
          collection_point: string
          data: Json
          episode_id: string | null
          flags: Json | null
          id: string
          report_path: string | null
          youtube_video_id: string | null
        }
        Insert: {
          collected_at?: string
          collection_point: string
          data: Json
          episode_id?: string | null
          flags?: Json | null
          id?: string
          report_path?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          collected_at?: string
          collection_point?: string
          data?: Json
          episode_id?: string | null
          flags?: Json | null
          id?: string
          report_path?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_reports_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          id: string
          key: string
          scope: string
          source: string
          synced_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          scope: string
          source?: string
          synced_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          scope?: string
          source?: string
          synced_at?: string
          value?: Json
        }
        Relationships: []
      }
      approval_authority_matrix: {
        Row: {
          approver: string
          category: string
          delegate_user_id: string | null
          id: string
          is_locked: boolean
          series_id: string
          updated_at: string
        }
        Insert: {
          approver: string
          category: string
          delegate_user_id?: string | null
          id?: string
          is_locked?: boolean
          series_id: string
          updated_at?: string
        }
        Update: {
          approver?: string
          category?: string
          delegate_user_id?: string | null
          id?: string
          is_locked?: boolean
          series_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_authority_matrix_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approval_type: string
          approved_by: string
          asset_id: string | null
          created_at: string
          episode_id: string | null
          id: string
          notes: string | null
        }
        Insert: {
          approval_type: string
          approved_by: string
          asset_id?: string | null
          created_at?: string
          episode_id?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          approval_type?: string
          approved_by?: string
          asset_id?: string | null
          created_at?: string
          episode_id?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_relations: {
        Row: {
          created_at: string
          id: string
          relation_type: string
          source_asset_id: string
          target_asset_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relation_type: string
          source_asset_id: string
          target_asset_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relation_type?: string
          source_asset_id?: string
          target_asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_relations_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relations_target_asset_id_fkey"
            columns: ["target_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          agent_id: string | null
          content: string | null
          created_at: string
          description: string | null
          drive_file_id: string | null
          drive_path: string | null
          drive_web_view_url: string | null
          episode_id: string | null
          file_type: string
          filename: string
          id: string
          metadata: Json | null
          revision_log: string | null
          series_id: string | null
          staging_expires_at: string | null
          staging_path: string | null
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
          version: number
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          drive_path?: string | null
          drive_web_view_url?: string | null
          episode_id?: string | null
          file_type: string
          filename: string
          id?: string
          metadata?: Json | null
          revision_log?: string | null
          series_id?: string | null
          staging_expires_at?: string | null
          staging_path?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          drive_path?: string | null
          drive_web_view_url?: string | null
          episode_id?: string | null
          file_type?: string
          filename?: string
          id?: string
          metadata?: Json | null
          revision_log?: string | null
          series_id?: string | null
          staging_expires_at?: string | null
          staging_path?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_log: {
        Row: {
          agent_id: string
          api_provider: string
          cost_usd: number
          created_at: string
          duration_ms: number | null
          episode_id: string | null
          id: string
          job_id: string | null
          model_or_tier: string | null
          operation: string
          tokens_used: number | null
        }
        Insert: {
          agent_id: string
          api_provider: string
          cost_usd: number
          created_at?: string
          duration_ms?: number | null
          episode_id?: string | null
          id?: string
          job_id?: string | null
          model_or_tier?: string | null
          operation: string
          tokens_used?: number | null
        }
        Update: {
          agent_id?: string
          api_provider?: string
          cost_usd?: number
          created_at?: string
          duration_ms?: number | null
          episode_id?: string | null
          id?: string
          job_id?: string | null
          model_or_tier?: string | null
          operation?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_log_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reports: {
        Row: {
          channel_id: string | null
          columns: string[] | null
          end_date: string | null
          fetched_at: string
          has_impressions: boolean
          id: number
          raw: string | null
          report_id: string
          report_type: string
          row_count: number | null
          start_date: string | null
        }
        Insert: {
          channel_id?: string | null
          columns?: string[] | null
          end_date?: string | null
          fetched_at?: string
          has_impressions?: boolean
          id?: never
          raw?: string | null
          report_id: string
          report_type: string
          row_count?: number | null
          start_date?: string | null
        }
        Update: {
          channel_id?: string | null
          columns?: string[] | null
          end_date?: string | null
          fetched_at?: string
          has_impressions?: boolean
          id?: never
          raw?: string | null
          report_id?: string
          report_type?: string
          row_count?: number | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_reports_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_snapshots: {
        Row: {
          captured_at: string
          channel_id: string | null
          comments: number
          id: number
          likes: number
          privacy: string | null
          scope: string
          source: string
          subscribers: number | null
          video_id: string | null
          videos_count: number | null
          views: number
        }
        Insert: {
          captured_at?: string
          channel_id?: string | null
          comments?: number
          id?: never
          likes?: number
          privacy?: string | null
          scope: string
          source?: string
          subscribers?: number | null
          video_id?: string | null
          videos_count?: number | null
          views?: number
        }
        Update: {
          captured_at?: string
          channel_id?: string | null
          comments?: number
          id?: never
          likes?: number
          privacy?: string | null
          scope?: string
          source?: string
          subscribers?: number | null
          video_id?: string | null
          videos_count?: number | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_snapshots_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          credential_key: string
          id: string
          metadata: Json
          name: string
          ntfy_topic: string | null
          status: string
          updated_at: string
          youtube_channel_id: string
        }
        Insert: {
          created_at?: string
          credential_key: string
          id?: string
          metadata?: Json
          name: string
          ntfy_topic?: string | null
          status?: string
          updated_at?: string
          youtube_channel_id: string
        }
        Update: {
          created_at?: string
          credential_key?: string
          id?: string
          metadata?: Json
          name?: string
          ntfy_topic?: string | null
          status?: string
          updated_at?: string
          youtube_channel_id?: string
        }
        Relationships: []
      }
      concierge_threads: {
        Row: {
          active_gate: string | null
          active_mode: string | null
          director_id: string | null
          ended_at: string | null
          episode_id: string | null
          id: string
          started_at: string
          title: string | null
        }
        Insert: {
          active_gate?: string | null
          active_mode?: string | null
          director_id?: string | null
          ended_at?: string | null
          episode_id?: string | null
          id?: string
          started_at?: string
          title?: string | null
        }
        Update: {
          active_gate?: string | null
          active_mode?: string | null
          director_id?: string | null
          ended_at?: string | null
          episode_id?: string | null
          id?: string
          started_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concierge_threads_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_turns: {
        Row: {
          content: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          role: string
          thread_id: string
          token_count: number | null
        }
        Insert: {
          content?: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          role: string
          thread_id: string
          token_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          role?: string
          thread_id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "concierge_turns_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "concierge_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_turns_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "concierge_threads_with_latest"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_intent: {
        Row: {
          agent_id: string
          blocked_count: number
          created_at: string
          episode_id: string
          id: string
          inngest_run_id: string | null
          input_hash: string
          shot_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          blocked_count?: number
          created_at?: string
          episode_id: string
          id?: string
          inngest_run_id?: string | null
          input_hash?: string
          shot_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          blocked_count?: number
          created_at?: string
          episode_id?: string
          id?: string
          inngest_run_id?: string | null
          input_hash?: string
          shot_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_intent_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_scorecard: {
        Row: {
          agent_failures: number
          approvals_creative_ai: number
          approvals_creative_human: number
          chain_fired_advances: number
          churn_refires: number
          codeable_touches_ai_ep: number
          codeable_touches_human: number
          codeable_touches_total: number
          created_at: string
          episode_id: string
          failures_by_stage: Json
          id: string
          kpi1_runs_per_shot: number
          latency_first_final_cut_s: number | null
          metrics: Json
          phase: string
          runs_by_stage: Json
          series_id: string | null
          shot_count: number
          stuck_shots_final: number
          total_advances: number
          total_agent_runs: number
        }
        Insert: {
          agent_failures: number
          approvals_creative_ai: number
          approvals_creative_human: number
          chain_fired_advances: number
          churn_refires: number
          codeable_touches_ai_ep: number
          codeable_touches_human: number
          codeable_touches_total: number
          created_at?: string
          episode_id: string
          failures_by_stage?: Json
          id?: string
          kpi1_runs_per_shot: number
          latency_first_final_cut_s?: number | null
          metrics?: Json
          phase: string
          runs_by_stage?: Json
          series_id?: string | null
          shot_count: number
          stuck_shots_final: number
          total_advances: number
          total_agent_runs: number
        }
        Update: {
          agent_failures?: number
          approvals_creative_ai?: number
          approvals_creative_human?: number
          chain_fired_advances?: number
          churn_refires?: number
          codeable_touches_ai_ep?: number
          codeable_touches_human?: number
          codeable_touches_total?: number
          created_at?: string
          episode_id?: string
          failures_by_stage?: Json
          id?: string
          kpi1_runs_per_shot?: number
          latency_first_final_cut_s?: number | null
          metrics?: Json
          phase?: string
          runs_by_stage?: Json
          series_id?: string | null
          shot_count?: number
          stuck_shots_final?: number
          total_advances?: number
          total_agent_runs?: number
        }
        Relationships: [
          {
            foreignKeyName: "episode_scorecard_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_scorecard_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          budget_ceiling: number | null
          budget_spent: number | null
          created_at: string
          episode_code: string
          governance_mode: number
          id: string
          metadata: Json
          series_id: string
          status: Database["public"]["Enums"]["episode_status"]
          title_working: string | null
          updated_at: string
        }
        Insert: {
          budget_ceiling?: number | null
          budget_spent?: number | null
          created_at?: string
          episode_code: string
          governance_mode?: number
          id?: string
          metadata?: Json
          series_id: string
          status?: Database["public"]["Enums"]["episode_status"]
          title_working?: string | null
          updated_at?: string
        }
        Update: {
          budget_ceiling?: number | null
          budget_spent?: number | null
          created_at?: string
          episode_code?: string
          governance_mode?: number
          id?: string
          metadata?: Json
          series_id?: string
          status?: Database["public"]["Enums"]["episode_status"]
          title_working?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_decision_log: {
        Row: {
          autonomous: boolean
          created_at: string
          decided_by: string
          decision: string
          episode_id: string
          gate: string
          gate_class: string
          governance_mode: number | null
          id: string
          shot_id: string | null
        }
        Insert: {
          autonomous: boolean
          created_at?: string
          decided_by: string
          decision: string
          episode_id: string
          gate: string
          gate_class: string
          governance_mode?: number | null
          id?: string
          shot_id?: string | null
        }
        Update: {
          autonomous?: boolean
          created_at?: string
          decided_by?: string
          decision?: string
          episode_id?: string
          gate?: string
          gate_class?: string
          governance_mode?: number | null
          id?: string
          shot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_decision_log_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          agent_id: string
          completed_at: string | null
          created_at: string
          episode_id: string | null
          error_message: string | null
          id: string
          inngest_event: string
          inngest_run_id: string | null
          input_snapshot: Json | null
          output_ref: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          agent_id: string
          completed_at?: string | null
          created_at?: string
          episode_id?: string | null
          error_message?: string | null
          id?: string
          inngest_event: string
          inngest_run_id?: string | null
          input_snapshot?: Json | null
          output_ref?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          episode_id?: string | null
          error_message?: string | null
          id?: string
          inngest_event?: string
          inngest_run_id?: string | null
          input_snapshot?: Json | null
          output_ref?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_assignments: {
        Row: {
          active_provider_id: string
          contract: string
          fallback_provider_id: string | null
          is_active: boolean
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_provider_id: string
          contract: string
          fallback_provider_id?: string | null
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_provider_id?: string
          contract?: string
          fallback_provider_id?: string | null
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      series: {
        Row: {
          audience: string | null
          channel_id: string | null
          code: string
          created_at: string
          created_by: string | null
          episode_budget_ceiling: number | null
          genre: string | null
          id: string
          logline: string | null
          metadata: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          channel_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          episode_budget_ceiling?: number | null
          genre?: string | null
          id?: string
          logline?: string | null
          metadata?: Json
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          channel_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          episode_budget_ceiling?: number | null
          genre?: string | null
          id?: string
          logline?: string | null
          metadata?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      concierge_threads_with_latest: {
        Row: {
          active_gate: string | null
          active_mode: string | null
          director_id: string | null
          ended_at: string | null
          episode_id: string | null
          id: string | null
          last_turn_at: string | null
          started_at: string | null
          title: string | null
          turn_count: number | null
        }
        Insert: {
          active_gate?: string | null
          active_mode?: string | null
          director_id?: string | null
          ended_at?: string | null
          episode_id?: string | null
          id?: string | null
          last_turn_at?: never
          started_at?: string | null
          title?: string | null
          turn_count?: never
        }
        Update: {
          active_gate?: string | null
          active_mode?: string | null
          director_id?: string | null
          ended_at?: string | null
          episode_id?: string | null
          id?: string | null
          last_turn_at?: never
          started_at?: string | null
          title?: string | null
          turn_count?: never
        }
        Relationships: [
          {
            foreignKeyName: "concierge_threads_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_dispatch_intent: {
        Args: {
          p_agent: string
          p_episode: string
          p_hash: string
          p_run: string
          p_shot: string
        }
        Returns: {
          blocking_run_id: string
          blocking_status: string
          claimed: boolean
        }[]
      }
      increment_budget_spent: {
        Args: { p_cost: number; p_episode: string }
        Returns: {
          allowed: boolean
          ceiling: number
          spent: number
        }[]
      }
    }
    Enums: {
      asset_status:
        | "DRAFT"
        | "REVIEW"
        | "REVISION"
        | "APPROVED"
        | "LOCKED"
        | "NEEDS_HUMAN_TWEAK"
        | "REJECTED"
        | "INVALIDATED"
        | "TEST"
      episode_status:
        | "BRIEF_PENDING"
        | "BRIEF_APPROVED"
        | "SCRIPT_IN_PROGRESS"
        | "SCRIPT_REVIEW"
        | "SCRIPT_REVISION"
        | "SCRIPT_APPROVED"
        | "STORYBOARD_IN_PROGRESS"
        | "STORYBOARD_REVIEW"
        | "STORYBOARD_REVISION"
        | "STORYBOARD_APPROVED"
        | "ANIMATIC_IN_PROGRESS"
        | "ANIMATIC_REVIEW"
        | "ANIMATIC_REVISION"
        | "ANIMATIC_APPROVED"
        | "GENERATION_IN_PROGRESS"
        | "GENERATION_REVIEW"
        | "GENERATION_REVISION"
        | "GENERATION_APPROVED"
        | "PUBLISH_PENDING"
        | "PUBLISHED"
        | "ANALYTICS_COLLECTING"
        | "COMPLETE"
        | "ARCHIVED"
      job_status:
        | "QUEUED"
        | "RUNNING"
        | "COMPLETED"
        | "FAILED"
        | "RETRYING"
        | "CANCELLED"
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
      asset_status: [
        "DRAFT",
        "REVIEW",
        "REVISION",
        "APPROVED",
        "LOCKED",
        "NEEDS_HUMAN_TWEAK",
        "REJECTED",
        "INVALIDATED",
        "TEST",
      ],
      episode_status: [
        "BRIEF_PENDING",
        "BRIEF_APPROVED",
        "SCRIPT_IN_PROGRESS",
        "SCRIPT_REVIEW",
        "SCRIPT_REVISION",
        "SCRIPT_APPROVED",
        "STORYBOARD_IN_PROGRESS",
        "STORYBOARD_REVIEW",
        "STORYBOARD_REVISION",
        "STORYBOARD_APPROVED",
        "ANIMATIC_IN_PROGRESS",
        "ANIMATIC_REVIEW",
        "ANIMATIC_REVISION",
        "ANIMATIC_APPROVED",
        "GENERATION_IN_PROGRESS",
        "GENERATION_REVIEW",
        "GENERATION_REVISION",
        "GENERATION_APPROVED",
        "PUBLISH_PENDING",
        "PUBLISHED",
        "ANALYTICS_COLLECTING",
        "COMPLETE",
        "ARCHIVED",
      ],
      job_status: [
        "QUEUED",
        "RUNNING",
        "COMPLETED",
        "FAILED",
        "RETRYING",
        "CANCELLED",
      ],
    },
  },
} as const
