/** v0.0.1 schema contract; update alongside supabase/schemas changes. */
export type AdminRole = "super_admin" | "admin" | "editor";

export type AdminMembership = {
  user_id: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
};

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: AdminMembership;
        Insert: {
          user_id: string;
          role: AdminRole;
          is_active?: boolean;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          role?: AdminRole;
          is_active?: boolean;
          created_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
