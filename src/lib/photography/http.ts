import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../supabase/server";
import { getClientAccessState } from "../auth/access";
import { getSupabaseConfig } from "../supabase/config";
import { supabaseFetch } from "../supabase/fetch";
import type { Database } from "../supabase/database.types";
import { assertMediaAccess, assertMediaOrigin } from "../media/http-policy";
import { mediaBody, mediaJson } from "../media/http";
import { MediaError } from "../media/types";
import { publicUrl } from "../media/keys";
import { createPhotographyStore } from "./store";
import { photographyStorage } from "./storage";
import type { PhotographyItem, PhotographyView } from "./types";

export { mediaJson as photographyJson };
export const photographyBody = (request: Request) => mediaBody(request, 128 * 1024);
export async function photographyContext(request: Request) {
  const client = await createServerSupabaseClient({ writableCookies: true });
  const admin = assertMediaAccess(client ? await getClientAccessState(client) : { status: "configuration" });
  if (!["GET", "HEAD"].includes(request.method)) assertMediaOrigin(request);
  if (!client) throw new MediaError("Configure Supabase before using Photography.", 503);
  const supabase = getSupabaseConfig();
  if (!supabase.configured || !process.env.SUPABASE_SECRET_KEY?.trim()) throw new MediaError("Configure Supabase and the server-only SUPABASE_SECRET_KEY before using Photography.", 503);
  const internal = createClient<Database>(supabase.url, process.env.SUPABASE_SECRET_KEY.trim(), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: supabaseFetch } });
  const store = createPhotographyStore(internal);
  return { client, internal, admin, store, services: () => ({ store, ...photographyStorage() }) };
}
export type PhotographyContext = Awaited<ReturnType<typeof photographyContext>>;
export async function photographyRoute(request: Request, work: (context: PhotographyContext) => Promise<Response>) {
  try { return await work(await photographyContext(request)); }
  catch (error) {
    if (error instanceof MediaError) return mediaJson({ error: error.message, code: error.code }, error.status);
    return mediaJson({ error: "Photography is unavailable. Retry, or check server configuration if the problem continues." }, 503);
  }
}
export async function photographyViews(rows: PhotographyItem[], context: PhotographyContext): Promise<PhotographyView[]> {
  if (!rows.length) return [];
  const { config, privateR2 } = context.services();
  const relations = await context.store.relations(rows.map((r) => r.id));
  return Promise.all(rows.map(async (row) => {
    const { original_key: originalKey, preview_key: previewKey, thumbnail_key: thumbnailKey, poster_key: posterKey, upload_state: uploadState, ...visible } = row;
    void originalKey; void uploadState;
    const available = ["ready", "publishing", "unpublishing"].includes(row.storage_status);
    const [preview_url, thumbnail_url, poster_url] = await Promise.all([
      available ? privateR2.previewUrl(previewKey) : null,
      available ? privateR2.previewUrl(thumbnailKey) : null,
      available && posterKey ? privateR2.previewUrl(posterKey) : null,
    ]);
    const tagIds = new Set(relations.itemTags.filter((t) => t.item_id === row.id).map((t) => t.tag_id));
    return { ...visible, preview_url, thumbnail_url, poster_url, public_url: row.status === "published" && row.public_key ? publicUrl(config.publicBaseUrl, row.public_key) : null, tags: relations.tags.filter((t) => tagIds.has(t.id)), album_ids: relations.albumItems.filter((a) => a.item_id === row.id).map((a) => a.album_id) };
  }));
}
export async function photographyView(row: PhotographyItem, context: PhotographyContext): Promise<PhotographyView> { return (await photographyViews([row], context))[0]; }

export function expectedUpdatedAt(body: Record<string, unknown>): string {
  if (typeof body.expected_updated_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(body.expected_updated_at) || !Number.isFinite(Date.parse(body.expected_updated_at))) throw new MediaError("Reload this item before saving; its last-saved timestamp is required.");
  return body.expected_updated_at;
}
