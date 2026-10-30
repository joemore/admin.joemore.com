import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { MediaError } from "./types";
import type { MediaStore } from "./service";

/** Preserve only safe database error categories, never upstream details. */
export function mediaDatabaseError(error: { code?: string } | null): never {
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(error?.code || "")) {
    throw new MediaError("Install supabase/schemas/003_media_assets.sql before using the Media Library. See docs/media-library-setup.md.", 503, "schema_required");
  }
  if (error?.code === "23505") throw new MediaError("The generated media key is already reserved. Please retry.", 409, "collision");
  throw new MediaError("Media metadata is unavailable. Check the database connection, schema installation, and server permissions.", 503);
}

/** Only constructed after live user and administrator verification. */
export function createMediaStore(client: SupabaseClient<Database>): MediaStore {
  return {
    async get(id) {
      const { data, error } = await client.from("media_assets").select("*").eq("id", id).maybeSingle();
      if (error) mediaDatabaseError(error);
      return data;
    },
    async insert(asset) {
      const { error } = await client.from("media_assets").insert(asset);
      if (error) mediaDatabaseError(error);
    },
    async update(id, patch, expectedStatuses, expectedUpdatedAt) {
      let query = client.from("media_assets").update(patch).eq("id", id);
      if (expectedStatuses?.length) query = query.in("status", expectedStatuses);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) mediaDatabaseError(error);
      return data;
    },
    async stale(before, limit) {
      const { data, error } = await client.from("media_assets").select("*")
        .in("status", ["pending", "completing", "failed", "deleting", "delete_failed"])
        .lt("upload_expires_at", before).lt("updated_at", before)
        .order("upload_expires_at", { ascending: true }).limit(limit);
      if (error) mediaDatabaseError(error);
      return data || [];
    },
  };
}
