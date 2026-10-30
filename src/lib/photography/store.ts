import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { MediaError } from "../media/types";
import type { PhotographyAlbum, PhotographyItem, PhotographyMetadata, PhotographyTag } from "./types";
import type { PhotographyQuery } from "./validation";

export function photographyDatabaseError(error: { code?: string } | null): never {
  if (["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"].includes(error?.code || "")) throw new MediaError("Install supabase/schemas/004_photography.sql before using Photography. See docs/photography-setup.md.", 503, "schema_required");
  if (error?.code === "23505") throw new MediaError("This tag, album slug or photograph already exists.", 409, "duplicate");
  if (error?.code === "40001") throw new MediaError("This item changed or is busy. Reload it before saving your changes.", 409, "conflict");
  if (error?.code === "P0002") throw new MediaError("The selected photograph or album was not found.", 404);
  if (["23503", "23514", "22023", "22007", "22008"].includes(error?.code || "")) throw new MediaError("The metadata or selected memberships are invalid. Review your changes, including the original-download acknowledgement.", 400);
  throw new MediaError("Photography metadata is unavailable. Check the schema and server configuration.", 503);
}
export interface PhotographyStore {
  get(id: string): Promise<PhotographyItem | null>;
  insert(item: PhotographyItem): Promise<void>;
  update(id: string, patch: Partial<PhotographyItem>, expectedStorageStatuses?: PhotographyItem["storage_status"][], expectedUpdatedAt?: string): Promise<PhotographyItem | null>;
  stale(before: string, limit: number): Promise<PhotographyItem[]>;
}
/** Service client is constructed only after fresh identity/membership checks. */
export function createPhotographyStore(client: SupabaseClient<Database>) {
  return {
    async get(id: string) {
      const { data, error } = await client.from("photography_items").select("*").eq("id", id).maybeSingle();
      if (error) photographyDatabaseError(error);
      return data;
    },
    async insert(item: PhotographyItem) {
      const { error } = await client.from("photography_items").insert(item);
      if (error) photographyDatabaseError(error);
    },
    async update(id: string, patch: Partial<PhotographyItem>, expectedStorageStatuses?: PhotographyItem["storage_status"][], expectedUpdatedAt?: string) {
      let query = client.from("photography_items").update(patch).eq("id", id);
      if (expectedStorageStatuses?.length) query = query.in("storage_status", expectedStorageStatuses);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) photographyDatabaseError(error);
      return data;
    },
    async stale(before: string, limit: number) {
      const { data, error } = await client.from("photography_items").select("*").in("storage_status", ["pending", "uploading", "failed", "cleanup"]).eq("status", "draft").is("public_key", null).lt("upload_expires_at", before).lt("updated_at", before).order("upload_expires_at", { ascending: true }).limit(limit);
      if (error) photographyDatabaseError(error);
      return data || [];
    },
    async findDuplicate(fingerprint: string) {
      const { data, error } = await client.from("photography_items").select("*").eq("fingerprint", fingerprint).not("storage_status", "in", "(failed,cleanup)").limit(1).maybeSingle();
      if (error) photographyDatabaseError(error);
      return data;
    },
    async list(filters: PhotographyQuery) {
      const { data, error } = await client.rpc("photography_list", { p_filters: filters });
      if (error) photographyDatabaseError(error);
      return data || { items: [], count: 0 };
    },
    async catalog() {
      const results = await Promise.all([client.from("photography_tags").select("*").order("name"), client.from("photography_albums").select("*").order("display_order").order("title")]);
      for (const result of results) if (result.error) photographyDatabaseError(result.error);
      return { tags: results[0].data || [], albums: results[1].data || [] };
    },
    async relations(ids: string[]) {
      if (!ids.length) return { itemTags: [], albumItems: [], tags: [] as PhotographyTag[] };
      const results = await Promise.all([client.from("photography_item_tags").select("*").in("item_id", ids), client.from("photography_album_items").select("*").in("item_id", ids)]);
      for (const result of results) if (result.error) photographyDatabaseError(result.error);
      const itemTags = results[0].data || [], albumItems = results[1].data || [];
      const tagIds = [...new Set(itemTags.map((t) => t.tag_id))];
      const tagResult = tagIds.length ? await client.from("photography_tags").select("*").in("id", tagIds) : { data: [], error: null };
      if (tagResult.error) photographyDatabaseError(tagResult.error);
      return { itemTags, albumItems, tags: tagResult.data || [] };
    },
    async editItems(input: { ids: string[]; metadata: Partial<PhotographyMetadata>; tagIds?: string[]; albumIds?: string[]; expectedUpdatedAt?: string; gpsReviewed?: boolean; assignmentMode?: "add" | "replace" }) {
      const { data, error } = await client.rpc("photography_edit_items", { p_ids: input.ids, p_metadata: input.metadata, p_tag_ids: input.tagIds ?? null, p_album_ids: input.albumIds ?? null, p_expected_updated_at: input.expectedUpdatedAt ?? null, p_gps_reviewed: input.gpsReviewed || false, p_assignment_mode: input.assignmentMode || "replace" });
      if (error) photographyDatabaseError(error);
      return data || [];
    },
    async createTag(name: string, slug: string) {
      // Existing normalized tags are returned; a simultaneous create is handled
      // with an exact slug lookup after the unique constraint wins the race.
      const existing = await client.from("photography_tags").select("*").eq("slug", slug).maybeSingle();
      if (existing.error) photographyDatabaseError(existing.error);
      if (existing.data) return existing.data;
      const result = await client.from("photography_tags").insert({ name, slug }).select("*").single();
      if (result.error?.code === "23505") {
        const retry = await client.from("photography_tags").select("*").eq("slug", slug).maybeSingle();
        if (retry.data && !retry.error) return retry.data;
      }
      if (result.error) photographyDatabaseError(result.error);
      return result.data!;
    },
    async renameTag(id: string, name: string, slug: string) {
      const { data, error } = await client.from("photography_tags").update({ name, slug }).eq("id", id).select("*").maybeSingle();
      if (error) photographyDatabaseError(error);
      if (!data) throw new MediaError("Tag not found.", 404);
      return data;
    },
    async createAlbum(patch: Partial<PhotographyAlbum> & Pick<PhotographyAlbum, "title" | "slug">) {
      const { data, error } = await client.from("photography_albums").insert(patch).select("*").single();
      if (error) photographyDatabaseError(error);
      return data!;
    },
    async updateAlbum(id: string, patch: Partial<PhotographyAlbum>) {
      if (patch.cover_item_id) {
        const membership = await client.from("photography_album_items").select("item_id").eq("album_id", id).eq("item_id", patch.cover_item_id).maybeSingle();
        if (membership.error) photographyDatabaseError(membership.error);
        if (!membership.data) throw new MediaError("Choose a cover from this album's photographs.");
      }
      const { data, error } = await client.from("photography_albums").update(patch).eq("id", id).select("*").maybeSingle();
      if (error) photographyDatabaseError(error);
      if (!data) throw new MediaError("Album not found.", 404);
      return data;
    },
    async deleteAlbum(id: string) {
      const { error } = await client.from("photography_albums").delete().eq("id", id);
      if (error) photographyDatabaseError(error);
    },
    async albumItems(id: string) {
      const { data, error } = await client.from("photography_album_items").select("*").eq("album_id", id).order("sort_position").limit(2000);
      if (error) photographyDatabaseError(error);
      if (!data?.length) return [];
      const items = await client.from("photography_items").select("*").in("id", data.map((a) => a.item_id));
      if (items.error) photographyDatabaseError(items.error);
      const byId = new Map((items.data || []).map((i) => [i.id, i]));
      return data.flatMap((a) => byId.has(a.item_id) ? [byId.get(a.item_id)!] : []);
    },
    async orderAlbum(id: string, itemIds: string[]) {
      const { error } = await client.rpc("photography_order_album", { p_album_id: id, p_item_ids: itemIds });
      if (error) photographyDatabaseError(error);
    },
  };
}
