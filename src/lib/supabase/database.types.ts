import type { MediaAsset } from "../media/types";
import type { PhotographyAlbum, PhotographyAlbumItem, PhotographyItem, PhotographyItemTag, PhotographyTag } from "../photography/types";

/** Schema contract; update alongside supabase/schemas changes. */
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
      photography_items: { Row: PhotographyItem; Insert: PhotographyItem; Update: Partial<PhotographyItem>; Relationships: [] };
      photography_tags: { Row: PhotographyTag; Insert: Partial<PhotographyTag> & Pick<PhotographyTag, "name" | "slug">; Update: Partial<Pick<PhotographyTag, "name" | "slug">>; Relationships: [] };
      photography_item_tags: { Row: PhotographyItemTag; Insert: PhotographyItemTag; Update: Partial<PhotographyItemTag>; Relationships: [] };
      photography_albums: { Row: PhotographyAlbum; Insert: Partial<PhotographyAlbum> & Pick<PhotographyAlbum, "title" | "slug">; Update: Partial<PhotographyAlbum>; Relationships: [] };
      photography_album_items: { Row: PhotographyAlbumItem; Insert: PhotographyAlbumItem; Update: Partial<PhotographyAlbumItem>; Relationships: [] };
      media_assets: {
        Row: MediaAsset;
        Insert: MediaAsset;
        Update: Partial<MediaAsset>;
        Relationships: [];
      };
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
    Functions: {
      photography_edit_items: { Args: { p_ids: string[]; p_metadata?: Record<string, unknown>; p_tag_ids?: string[] | null; p_album_ids?: string[] | null; p_expected_updated_at?: string | null; p_gps_reviewed?: boolean; p_assignment_mode?: string }; Returns: PhotographyItem[] };
      photography_order_album: { Args: { p_album_id: string; p_item_ids: string[] }; Returns: undefined };
      photography_list: { Args: { p_filters: Record<string, unknown> }; Returns: { items: PhotographyItem[]; count: number } };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
