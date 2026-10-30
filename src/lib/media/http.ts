import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../supabase/server";
import { getClientAccessState } from "../auth/access";
import { getSupabaseConfig } from "../supabase/config";
import { supabaseFetch } from "../supabase/fetch";
import type { Database } from "../supabase/database.types";
import { getMediaConfig } from "./config";
import { assertMediaAccess, assertMediaOrigin } from "./http-policy";
import { MediaError, type MediaAsset } from "./types";
import { publicUrl } from "./keys";
import { createR2Operations } from "./r2";
import { createMediaService } from "./service";
import { createMediaStore } from "./store";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Expires: "0" };
export const mediaJson = (value: unknown, status = 200) => Response.json(value, { status, headers: privateHeaders });

export async function mediaContext(request: Request) {
  const client = await createServerSupabaseClient({ writableCookies: true });
  const admin = assertMediaAccess(client ? await getClientAccessState(client) : { status: "configuration" });
  if (!["GET", "HEAD"].includes(request.method)) assertMediaOrigin(request);
  if (!client) throw new MediaError("Supabase configuration required.", 503);
  const configuration = getMediaConfig();
  return {
    client, admin, configuration,
    services() {
      if (!configuration.configured) throw new MediaError(`Media configuration required: ${configuration.missing.join(", ")}. See docs/media-library-setup.md.`, 503);
      const supabase = getSupabaseConfig();
      if (!supabase.configured) throw new MediaError("Supabase configuration required.", 503);
      // This client has no browser session or cookie adapter. The secret is needed
      // only for internal fields, which authenticated clients cannot write.
      const internal = createClient<Database>(supabase.url, process.env.SUPABASE_SECRET_KEY!.trim(), {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { fetch: supabaseFetch },
      });
      const store = createMediaStore(internal);
      const r2 = createR2Operations(configuration.config);
      return { store, r2, config: configuration.config, service: createMediaService({ store, r2, config: configuration.config, userId: admin.userId }) };
    },
  };
}

export type MediaContext = Awaited<ReturnType<typeof mediaContext>>;
export async function mediaRoute(request: Request, work: (context: MediaContext) => Promise<Response>) {
  try { return await work(await mediaContext(request)); }
  catch (error) {
    if (error instanceof MediaError) return mediaJson({ error: error.message, code: error.code }, error.status);
    // Upstream errors can contain signed URLs and request credentials. Never
    // serialize or log arbitrary SDK / Auth / database exceptions.
    return mediaJson({ error: "The media service is unavailable. Please retry. Check server configuration if the problem continues." }, 503);
  }
}

export async function mediaBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new MediaError("A JSON metadata body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024) { await reader.cancel(); throw new MediaError("Metadata request is too large.", 413); }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("Invalid JSON metadata.");
  } finally { reader.releaseLock(); }
}

export function assetView(asset: MediaAsset, base: string) {
  // Multipart IDs remain internal. Public URLs derive solely from immutable keys.
  const { upload_id: _uploadId, ...visible } = asset;
  void _uploadId;
  return { ...visible, public_url: publicUrl(base, asset.storage_key), thumbnail_url: asset.thumbnail_key ? publicUrl(base, asset.thumbnail_key) : null };
}
