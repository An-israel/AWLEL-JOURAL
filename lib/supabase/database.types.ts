export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      article_authors: {
        Row: {
          affiliation: string | null;
          article_id: string;
          email: string | null;
          full_name: string;
          id: string;
          is_corresponding: boolean;
          orcid: string | null;
          position: number;
          show_email: boolean;
        };
        ComputedFields: never;
        Insert: {
          affiliation?: string | null;
          article_id: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_corresponding?: boolean;
          orcid?: string | null;
          position?: number;
          show_email?: boolean;
        };
        Update: {
          affiliation?: string | null;
          article_id?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_corresponding?: boolean;
          orcid?: string | null;
          position?: number;
          show_email?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "article_authors_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          abstract: string | null;
          category_id: string | null;
          citation_style: Database["public"]["Enums"]["citation_style"];
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          docx_file_id: string | null;
          doi: string | null;
          download_count: number | null;
          download_docx_count: number;
          download_pdf_count: number;
          first_page: number | null;
          id: string;
          issue_id: string;
          keywords: string[];
          last_page: number | null;
          pdf_file_id: string | null;
          published_at: string | null;
          search_vector: unknown;
          slug: string;
          sort_order: number;
          status: Database["public"]["Enums"]["publish_status"];
          submission_id: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
          view_count: number;
        };
        ComputedFields: never;
        Insert: {
          abstract?: string | null;
          category_id?: string | null;
          citation_style?: Database["public"]["Enums"]["citation_style"];
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          docx_file_id?: string | null;
          doi?: string | null;
          download_count?: never;
          download_docx_count?: number;
          download_pdf_count?: number;
          first_page?: number | null;
          id?: string;
          issue_id: string;
          keywords?: string[];
          last_page?: number | null;
          pdf_file_id?: string | null;
          published_at?: string | null;
          search_vector?: unknown;
          slug: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["publish_status"];
          submission_id?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          view_count?: number;
        };
        Update: {
          abstract?: string | null;
          category_id?: string | null;
          citation_style?: Database["public"]["Enums"]["citation_style"];
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          docx_file_id?: string | null;
          doi?: string | null;
          download_count?: never;
          download_docx_count?: number;
          download_pdf_count?: number;
          first_page?: number | null;
          id?: string;
          issue_id?: string;
          keywords?: string[];
          last_page?: number | null;
          pdf_file_id?: string | null;
          published_at?: string | null;
          search_vector?: unknown;
          slug?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["publish_status"];
          submission_id?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_docx_file_id_fkey";
            columns: ["docx_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_pdf_file_id_fkey";
            columns: ["pdf_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          diff: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_archived: boolean;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      category_redirects: {
        Row: {
          category_id: string;
          created_at: string;
          old_slug: string;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          created_at?: string;
          old_slug: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          old_slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "category_redirects_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      circuit_breakers: {
        Row: {
          failures: number;
          name: string;
          opened_until: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          failures?: number;
          name: string;
          opened_until?: string | null;
          updated_at?: string;
        };
        Update: {
          failures?: number;
          name?: string;
          opened_until?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          email: string;
          id: string;
          is_read: boolean;
          message: string;
          name: string;
          subject: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          id?: string;
          is_read?: boolean;
          message: string;
          name: string;
          subject: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          name?: string;
          subject?: string;
        };
        Relationships: [];
      };
      cron_leases: {
        Row: {
          holder: string;
          locked_until: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          holder: string;
          locked_until: string;
          name: string;
        };
        Update: {
          holder?: string;
          locked_until?: string;
          name?: string;
        };
        Relationships: [];
      };
      cron_runs: {
        Row: {
          detail: NonNullable<Json>;
          error: string | null;
          finished_at: string | null;
          id: number;
          started_at: string;
          status: string;
          task: string;
        };
        ComputedFields: never;
        Insert: {
          detail?: NonNullable<Json>;
          error?: string | null;
          finished_at?: string | null;
          id?: never;
          started_at?: string;
          status: string;
          task: string;
        };
        Update: {
          detail?: NonNullable<Json>;
          error?: string | null;
          finished_at?: string | null;
          id?: never;
          started_at?: string;
          status?: string;
          task?: string;
        };
        Relationships: [];
      };
      dead_letter_jobs: {
        Row: {
          attempts: number;
          failed_at: string;
          id: number;
          idempotency_key: string | null;
          job_type: string;
          last_error: string | null;
          original_job_id: number;
          payload: NonNullable<Json>;
          resolution: string | null;
          resolved_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempts: number;
          failed_at?: string;
          id?: never;
          idempotency_key?: string | null;
          job_type: string;
          last_error?: string | null;
          original_job_id: number;
          payload: NonNullable<Json>;
          resolution?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          attempts?: number;
          failed_at?: string;
          id?: never;
          idempotency_key?: string | null;
          job_type?: string;
          last_error?: string | null;
          original_job_id?: number;
          payload?: NonNullable<Json>;
          resolution?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      department_milestones: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          needs_verification: boolean;
          sort_order: number;
          title: string;
          updated_at: string;
          version: number;
          year_label: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          needs_verification?: boolean;
          sort_order?: number;
          title: string;
          updated_at?: string;
          version?: number;
          year_label: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          needs_verification?: boolean;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          version?: number;
          year_label?: string;
        };
        Relationships: [];
      };
      domain_events: {
        Row: {
          actor_id: string | null;
          aggregate_id: string;
          aggregate_type: string;
          created_at: string;
          event_type: string;
          id: number;
          payload: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          aggregate_id: string;
          aggregate_type: string;
          created_at?: string;
          event_type: string;
          id?: never;
          payload?: NonNullable<Json>;
        };
        Update: {
          actor_id?: string | null;
          aggregate_id?: string;
          aggregate_type?: string;
          created_at?: string;
          event_type?: string;
          id?: never;
          payload?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "domain_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      editorial_board_groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      editorial_board_members: {
        Row: {
          affiliation: string | null;
          created_at: string;
          deleted_at: string | null;
          group_id: string;
          id: string;
          name: string;
          needs_verification: boolean;
          photo_file_id: string | null;
          sort_order: number;
          title: string | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          affiliation?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          group_id: string;
          id?: string;
          name: string;
          needs_verification?: boolean;
          photo_file_id?: string | null;
          sort_order?: number;
          title?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          affiliation?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          group_id?: string;
          id?: string;
          name?: string;
          needs_verification?: boolean;
          photo_file_id?: string | null;
          sort_order?: number;
          title?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "editorial_board_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "editorial_board_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "editorial_board_members_photo_file_id_fkey";
            columns: ["photo_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
        ];
      };
      email_suppressions: {
        Row: {
          created_at: string;
          email: string;
          reason: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          reason: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          reason?: string;
        };
        Relationships: [];
      };
      error_counts: {
        Row: {
          errors: number;
          minute: string;
        };
        ComputedFields: never;
        Insert: {
          errors?: number;
          minute: string;
        };
        Update: {
          errors?: number;
          minute?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          description: string;
          enabled: boolean;
          key: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          description?: string;
          enabled?: boolean;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          description?: string;
          enabled?: boolean;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      issue_redirects: {
        Row: {
          created_at: string;
          issue_id: string;
          issue_number: number;
          volume_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          issue_id: string;
          issue_number: number;
          volume_number: number;
        };
        Update: {
          created_at?: string;
          issue_id?: string;
          issue_number?: number;
          volume_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "issue_redirects_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
        ];
      };
      issues: {
        Row: {
          cover_alt: string | null;
          cover_file_id: string | null;
          created_at: string;
          deleted_at: string | null;
          editorial: string | null;
          full_docx_file_id: string | null;
          full_pdf_file_id: string | null;
          id: string;
          issue_number: number;
          legacy_number: number | null;
          month: number | null;
          published_at: string | null;
          status: Database["public"]["Enums"]["publish_status"];
          title: string | null;
          updated_at: string;
          version: number;
          volume_id: string;
        };
        ComputedFields: never;
        Insert: {
          cover_alt?: string | null;
          cover_file_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          editorial?: string | null;
          full_docx_file_id?: string | null;
          full_pdf_file_id?: string | null;
          id?: string;
          issue_number?: number;
          legacy_number?: number | null;
          month?: number | null;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["publish_status"];
          title?: string | null;
          updated_at?: string;
          version?: number;
          volume_id: string;
        };
        Update: {
          cover_alt?: string | null;
          cover_file_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          editorial?: string | null;
          full_docx_file_id?: string | null;
          full_pdf_file_id?: string | null;
          id?: string;
          issue_number?: number;
          legacy_number?: number | null;
          month?: number | null;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["publish_status"];
          title?: string | null;
          updated_at?: string;
          version?: number;
          volume_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "issues_cover_file_id_fkey";
            columns: ["cover_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issues_full_docx_file_id_fkey";
            columns: ["full_docx_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issues_full_pdf_file_id_fkey";
            columns: ["full_pdf_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issues_volume_id_fkey";
            columns: ["volume_id"];
            isOneToOne: false;
            referencedRelation: "volumes";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          id: number;
          idempotency_key: string | null;
          job_type: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_at: string;
          source_event_id: number | null;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          created_at?: string;
          id?: never;
          idempotency_key?: string | null;
          job_type: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          run_at?: string;
          source_event_id?: number | null;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          id?: never;
          idempotency_key?: string | null;
          job_type?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          run_at?: string;
          source_event_id?: number | null;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_source_event_id_fkey";
            columns: ["source_event_id"];
            isOneToOne: false;
            referencedRelation: "domain_events";
            referencedColumns: ["id"];
          },
        ];
      };
      metrics_daily: {
        Row: {
          article_id: string | null;
          day: string;
          event_count: number;
          event_type: Database["public"]["Enums"]["metrics_event_type"];
          issue_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          article_id?: string | null;
          day: string;
          event_count?: number;
          event_type: Database["public"]["Enums"]["metrics_event_type"];
          issue_id?: string | null;
        };
        Update: {
          article_id?: string | null;
          day?: string;
          event_count?: number;
          event_type?: Database["public"]["Enums"]["metrics_event_type"];
          issue_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "metrics_daily_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metrics_daily_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
        ];
      };
      metrics_events: {
        Row: {
          article_id: string | null;
          created_at: string;
          event_day: string;
          event_type: Database["public"]["Enums"]["metrics_event_type"];
          id: number;
          issue_id: string | null;
          session_hash: string;
        };
        ComputedFields: never;
        Insert: {
          article_id?: string | null;
          created_at?: string;
          event_day?: string;
          event_type: Database["public"]["Enums"]["metrics_event_type"];
          id?: never;
          issue_id?: string | null;
          session_hash: string;
        };
        Update: {
          article_id?: string | null;
          created_at?: string;
          event_day?: string;
          event_type?: Database["public"]["Enums"]["metrics_event_type"];
          id?: never;
          issue_id?: string | null;
          session_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metrics_events_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metrics_events_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
        ];
      };
      page_revisions: {
        Row: {
          content: string;
          id: string;
          meta_description: string | null;
          page_id: string;
          saved_at: string;
          saved_by: string | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          content: string;
          id?: string;
          meta_description?: string | null;
          page_id: string;
          saved_at?: string;
          saved_by?: string | null;
          title: string;
        };
        Update: {
          content?: string;
          id?: string;
          meta_description?: string | null;
          page_id?: string;
          saved_at?: string;
          saved_by?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_revisions_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "page_revisions_saved_by_fkey";
            columns: ["saved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          meta_description: string | null;
          needs_review: boolean;
          slug: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          meta_description?: string | null;
          needs_review?: boolean;
          slug: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          meta_description?: string | null;
          needs_review?: boolean;
          slug?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pages_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          affiliation: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          orcid: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          affiliation?: string | null;
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          is_active?: boolean;
          orcid?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          affiliation?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          orcid?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          hits: number;
          key: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          hits: number;
          key: string;
          window_start: string;
        };
        Update: {
          hits?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      review_assignments: {
        Row: {
          annotated_file_id: string | null;
          assigned_by: string | null;
          comments: string | null;
          confidential_comments: string | null;
          created_at: string;
          decline_reason: string | null;
          due_date: string | null;
          id: string;
          recommendation: Database["public"]["Enums"]["review_recommendation"] | null;
          reminder_sent_at: string | null;
          responded_at: string | null;
          response: string | null;
          reviewer_id: string;
          round: number;
          shared_with_author_at: string | null;
          status: Database["public"]["Enums"]["review_status"];
          submission_id: string;
          submitted_at: string | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          annotated_file_id?: string | null;
          assigned_by?: string | null;
          comments?: string | null;
          confidential_comments?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          due_date?: string | null;
          id?: string;
          recommendation?: Database["public"]["Enums"]["review_recommendation"] | null;
          reminder_sent_at?: string | null;
          responded_at?: string | null;
          response?: string | null;
          reviewer_id: string;
          round?: number;
          shared_with_author_at?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          submission_id: string;
          submitted_at?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          annotated_file_id?: string | null;
          assigned_by?: string | null;
          comments?: string | null;
          confidential_comments?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          due_date?: string | null;
          id?: string;
          recommendation?: Database["public"]["Enums"]["review_recommendation"] | null;
          reminder_sent_at?: string | null;
          responded_at?: string | null;
          response?: string | null;
          reviewer_id?: string;
          round?: number;
          shared_with_author_at?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          submission_id?: string;
          submitted_at?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "review_assignments_annotated_file_id_fkey";
            columns: ["annotated_file_id"];
            isOneToOne: false;
            referencedRelation: "submission_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_assignments_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_assignments_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      site_settings: {
        Row: {
          contact_email: string;
          default_og_image_file_id: string | null;
          home_content: NonNullable<Json>;
          id: number;
          issn: string;
          journal_name: string;
          journal_short_name: string;
          license_name: string | null;
          license_url: string | null;
          logo_file_id: string | null;
          postal_address: string | null;
          publication_frequency: string | null;
          publisher: string;
          social_links: NonNullable<Json>;
          subtitle: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          contact_email: string;
          default_og_image_file_id?: string | null;
          home_content?: NonNullable<Json>;
          id?: number;
          issn: string;
          journal_name: string;
          journal_short_name?: string;
          license_name?: string | null;
          license_url?: string | null;
          logo_file_id?: string | null;
          postal_address?: string | null;
          publication_frequency?: string | null;
          publisher: string;
          social_links?: NonNullable<Json>;
          subtitle: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          contact_email?: string;
          default_og_image_file_id?: string | null;
          home_content?: NonNullable<Json>;
          id?: number;
          issn?: string;
          journal_name?: string;
          journal_short_name?: string;
          license_name?: string | null;
          license_url?: string | null;
          logo_file_id?: string | null;
          postal_address?: string | null;
          publication_frequency?: string | null;
          publisher?: string;
          social_links?: NonNullable<Json>;
          subtitle?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "site_settings_default_og_image_file_id_fkey";
            columns: ["default_og_image_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_settings_logo_file_id_fkey";
            columns: ["logo_file_id"];
            isOneToOne: false;
            referencedRelation: "stored_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      slug_redirects: {
        Row: {
          article_id: string;
          created_at: string;
          old_slug: string;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          created_at?: string;
          old_slug: string;
        };
        Update: {
          article_id?: string;
          created_at?: string;
          old_slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slug_redirects_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      stored_files: {
        Row: {
          bucket: string;
          created_at: string;
          entity_id: string | null;
          file_role: Database["public"]["Enums"]["file_role"];
          id: string;
          mime_type: string;
          original_name: string;
          path: string;
          size_bytes: number;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          created_at?: string;
          entity_id?: string | null;
          file_role: Database["public"]["Enums"]["file_role"];
          id?: string;
          mime_type: string;
          original_name: string;
          path: string;
          size_bytes: number;
          uploaded_by?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          entity_id?: string | null;
          file_role?: Database["public"]["Enums"]["file_role"];
          id?: string;
          mime_type?: string;
          original_name?: string;
          path?: string;
          size_bytes?: number;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stored_files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_authors: {
        Row: {
          affiliation: string | null;
          email: string | null;
          full_name: string;
          id: string;
          is_corresponding: boolean;
          orcid: string | null;
          position: number;
          submission_id: string;
        };
        ComputedFields: never;
        Insert: {
          affiliation?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          is_corresponding?: boolean;
          orcid?: string | null;
          position?: number;
          submission_id: string;
        };
        Update: {
          affiliation?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_corresponding?: boolean;
          orcid?: string | null;
          position?: number;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_authors_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["submission_status"] | null;
          id: string;
          message: string | null;
          submission_id: string;
          to_status: Database["public"]["Enums"]["submission_status"];
          visible_to_author: boolean;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["submission_status"] | null;
          id?: string;
          message?: string | null;
          submission_id: string;
          to_status: Database["public"]["Enums"]["submission_status"];
          visible_to_author?: boolean;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["submission_status"] | null;
          id?: string;
          message?: string | null;
          submission_id?: string;
          to_status?: Database["public"]["Enums"]["submission_status"];
          visible_to_author?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "submission_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_events_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_files: {
        Row: {
          author_response: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["submission_file_kind"];
          mime_type: string;
          original_name: string;
          path: string;
          size_bytes: number;
          submission_id: string;
          uploaded_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          author_response?: string | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["submission_file_kind"];
          mime_type: string;
          original_name: string;
          path: string;
          size_bytes: number;
          submission_id: string;
          uploaded_by?: string | null;
          version?: number;
        };
        Update: {
          author_response?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["submission_file_kind"];
          mime_type?: string;
          original_name?: string;
          path?: string;
          size_bytes?: number;
          submission_id?: string;
          uploaded_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "submission_files_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submission_files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          abstract: string;
          article_id: string | null;
          author_id: string;
          category_id: string | null;
          citation_style: Database["public"]["Enums"]["citation_style"];
          contact_email: string | null;
          contact_phone: string | null;
          cover_letter: string | null;
          created_at: string;
          declarations: NonNullable<Json>;
          deleted_at: string | null;
          finalised_at: string | null;
          id: string;
          idempotency_key: string;
          keywords: string[];
          review_round: number;
          revision_due_date: string | null;
          revision_reminder_sent_at: string | null;
          status: Database["public"]["Enums"]["submission_status"];
          title: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          abstract: string;
          article_id?: string | null;
          author_id: string;
          category_id?: string | null;
          citation_style: Database["public"]["Enums"]["citation_style"];
          contact_email?: string | null;
          contact_phone?: string | null;
          cover_letter?: string | null;
          created_at?: string;
          declarations?: NonNullable<Json>;
          deleted_at?: string | null;
          finalised_at?: string | null;
          id?: string;
          idempotency_key: string;
          keywords?: string[];
          review_round?: number;
          revision_due_date?: string | null;
          revision_reminder_sent_at?: string | null;
          status?: Database["public"]["Enums"]["submission_status"];
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          abstract?: string;
          article_id?: string | null;
          author_id?: string;
          category_id?: string | null;
          citation_style?: Database["public"]["Enums"]["citation_style"];
          contact_email?: string | null;
          contact_phone?: string | null;
          cover_letter?: string | null;
          created_at?: string;
          declarations?: NonNullable<Json>;
          deleted_at?: string | null;
          finalised_at?: string | null;
          id?: string;
          idempotency_key?: string;
          keywords?: string[];
          review_round?: number;
          revision_due_date?: string | null;
          revision_reminder_sent_at?: string | null;
          status?: Database["public"]["Enums"]["submission_status"];
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      volumes: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          version: number;
          volume_number: number;
          year: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          version?: number;
          volume_number: number;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          version?: number;
          volume_number?: number;
          year?: number;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          event_type: string;
          id: string;
          received_at: string;
          source: string;
        };
        ComputedFields: never;
        Insert: {
          event_type: string;
          id: string;
          received_at?: string;
          source: string;
        };
        Update: {
          event_type?: string;
          id?: string;
          received_at?: string;
          source?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_article_authors: {
        Row: {
          affiliation: string | null;
          article_id: string | null;
          email: string | null;
          full_name: string | null;
          id: string | null;
          is_corresponding: boolean | null;
          orcid: string | null;
          position: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "article_authors_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_submission_note: {
        Args: { p_message: string; p_submission_id: string; p_visible_to_author: boolean };
        Returns: string;
      };
      article_search_document: { Args: { p_article_id: string }; Returns: unknown };
      breaker_allows: { Args: { p_name: string }; Returns: boolean };
      breaker_record: {
        Args: { p_name: string; p_ok: boolean; p_open_seconds?: number; p_threshold?: number };
        Returns: undefined;
      };
      categories_with_counts: {
        Args: Record<PropertyKey, never>;
        Returns: {
          article_count: number;
          description: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        }[];
      };
      change_submission_status: {
        Args: {
          p_expected_version: number;
          p_message?: string;
          p_revision_due_date?: string;
          p_status: Database["public"]["Enums"]["submission_status"];
          p_submission_id: string;
          p_visible_to_author?: boolean;
        };
        Returns: number;
      };
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: {
          allowed: boolean;
          remaining: number;
          retry_after_seconds: number;
        }[];
      };
      claim_job: {
        Args: { p_id: number; p_worker: string };
        Returns: {
          attempts: number;
          created_at: string;
          id: number;
          idempotency_key: string | null;
          job_type: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_at: string;
          source_event_id: number | null;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_jobs: {
        Args: { p_limit?: number; p_worker: string };
        Returns: {
          attempts: number;
          created_at: string;
          id: number;
          idempotency_key: string | null;
          job_type: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_at: string;
          source_event_id: number | null;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      cron_acquire: { Args: { p_holder: string; p_name: string; p_ttl_seconds: number }; Returns: boolean };
      cron_release: { Args: { p_holder: string; p_name: string }; Returns: undefined };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      defer_job: { Args: { p_id: number; p_retry_in_ms: number }; Returns: undefined };
      delete_issue_forever: { Args: { p_issue_id: string }; Returns: undefined };
      due_review_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: {
          assignment_id: string;
          due_date: string;
          reviewer_email: string;
          reviewer_name: string;
          title: string;
        }[];
      };
      due_revision_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: {
          author_email: string;
          author_name: string;
          due_date: string;
          submission_id: string;
          title: string;
        }[];
      };
      errors_since: { Args: { p_minutes: number }; Returns: number };
      fail_job: {
        Args: { p_error: string; p_id: number; p_retry_in_ms: number; p_retryable: boolean };
        Returns: string;
      };
      feature_enabled: { Args: { p_key: string }; Returns: boolean };
      finalize_submission: { Args: { p_submission_id: string }; Returns: boolean };
      finish_job: { Args: { p_id: number }; Returns: undefined };
      html_to_text: { Args: { p_html: string }; Returns: string };
      is_assigned_reviewer: { Args: { p_submission_id: string }; Returns: boolean };
      is_published_article: { Args: { p_article_id: string }; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_submission_author: { Args: { p_submission_id: string }; Returns: boolean };
      is_super_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      metrics_timeseries: {
        Args: { p_article_id?: string; p_from: string; p_to: string };
        Returns: {
          day: string;
          downloads: number;
          views: number;
        }[];
      };
      metrics_top_articles: {
        Args: { p_from: string; p_limit?: number; p_to: string };
        Returns: {
          article_id: string;
          downloads: number;
          views: number;
        }[];
      };
      orphaned_objects: {
        Args: { p_limit?: number; p_older_than_hours?: number };
        Returns: {
          bucket_id: string;
          name: string;
        }[];
      };
      peek_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: {
          allowed: boolean;
          remaining: number;
          retry_after_seconds: number;
        }[];
      };
      record_app_error: { Args: Record<PropertyKey, never>; Returns: undefined };
      record_metric_event: {
        Args: {
          p_article_id?: string;
          p_event_type: Database["public"]["Enums"]["metrics_event_type"];
          p_issue_id?: string;
          p_session_hash: string;
        };
        Returns: boolean;
      };
      record_revision: {
        Args: { p_file_id: string; p_response?: string };
        Returns: {
          recorded: boolean;
          submission_id: string;
          title: string;
        }[];
      };
      release_stale_jobs: { Args: { p_older_than_seconds?: number }; Returns: number };
      reorder_rows: { Args: { p_ids: string[]; p_table: string }; Returns: undefined };
      resolve_dead_letter: { Args: { p_action: string; p_id: number }; Returns: undefined };
      reviewer_files: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          file_id: string;
          is_pdf: boolean;
          kind: Database["public"]["Enums"]["submission_file_kind"];
          submission_id: string;
          version: number;
        }[];
      };
      reviewer_queue: {
        Args: Record<PropertyKey, never>;
        Returns: {
          abstract: string;
          assigned_at: string;
          assignment_id: string;
          assignment_status: Database["public"]["Enums"]["review_status"];
          assignment_version: number;
          category_name: string;
          citation_style: Database["public"]["Enums"]["citation_style"];
          comments: string;
          confidential_comments: string;
          due_date: string;
          keywords: string[];
          recommendation: Database["public"]["Enums"]["review_recommendation"];
          response: string;
          round: number;
          submission_id: string;
          submitted_at: string;
          title: string;
        }[];
      };
      rollup_metrics: { Args: Record<PropertyKey, never>; Returns: number };
      row_changed: { Args: { ignored: string[]; new_row: Json; old_row: Json }; Returns: boolean };
      save_article: {
        Args: { p_authors: Json; p_data: Json; p_expected_version: number; p_id: string };
        Returns: {
          id: string;
          version: number;
        }[];
      };
      schema_version: { Args: Record<PropertyKey, never>; Returns: string };
      search_articles: {
        Args: {
          p_author?: string;
          p_category_slug?: string;
          p_issue_id?: string;
          p_limit?: number;
          p_offset?: number;
          p_query: string;
          p_volume?: number;
          p_year?: number;
        };
        Returns: {
          abstract_highlight: string;
          id: string;
          rank: number;
          slug: string;
          title: string;
          title_highlight: string;
          total_count: number;
        }[];
      };
      set_issue_status: {
        Args: {
          p_expected_version: number;
          p_include_articles?: boolean;
          p_issue_id: string;
          p_status: Database["public"]["Enums"]["publish_status"];
        };
        Returns: number;
      };
      submission_id_from_path: { Args: { p_name: string }; Returns: string };
      submission_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["submission_status"];
          p_to: Database["public"]["Enums"]["submission_status"];
        };
        Returns: boolean;
      };
      unique_article_slug: { Args: { p_except?: string; p_slug: string }; Returns: string };
      withdraw_submission: { Args: { p_reason?: string; p_submission_id: string }; Returns: number };
    };
    Enums: {
      citation_style: "apa7" | "mla8";
      file_role:
        | "issue_cover"
        | "issue_pdf"
        | "issue_docx"
        | "article_pdf"
        | "article_docx"
        | "board_photo"
        | "site_asset";
      job_status: "queued" | "running" | "succeeded";
      metrics_event_type: "view" | "download_pdf" | "download_docx";
      publish_status: "draft" | "published";
      review_recommendation: "accept" | "minor_revisions" | "major_revisions" | "reject";
      review_status: "pending" | "submitted" | "withdrawn";
      submission_file_kind: "original" | "revision" | "reviewer_annotated";
      submission_status:
        | "submitted"
        | "under_screening"
        | "under_review"
        | "revisions_requested"
        | "revision_received"
        | "accepted"
        | "rejected"
        | "published"
        | "withdrawn";
      user_role: "super_admin" | "editor" | "reviewer" | "author";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      citation_style: ["apa7", "mla8"],
      file_role: [
        "issue_cover",
        "issue_pdf",
        "issue_docx",
        "article_pdf",
        "article_docx",
        "board_photo",
        "site_asset",
      ],
      job_status: ["queued", "running", "succeeded"],
      metrics_event_type: ["view", "download_pdf", "download_docx"],
      publish_status: ["draft", "published"],
      review_recommendation: ["accept", "minor_revisions", "major_revisions", "reject"],
      review_status: ["pending", "submitted", "withdrawn"],
      submission_file_kind: ["original", "revision", "reviewer_annotated"],
      submission_status: [
        "submitted",
        "under_screening",
        "under_review",
        "revisions_requested",
        "revision_received",
        "accepted",
        "rejected",
        "published",
        "withdrawn",
      ],
      user_role: ["super_admin", "editor", "reviewer", "author"],
    },
  },
} as const;
