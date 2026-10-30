import type { AccessState } from "../auth/policy";
import { MediaError } from "./types";
import type { MediaType } from "./types";

/** Authorization is re-evaluated for every endpoint, including read-only requests. */
export function assertMediaAccess(state: AccessState) {
  if (state.status === "admin") return state.admin;
  if (state.status === "signed-out") throw new MediaError("Sign in to use the Media Library.", 401);
  if (state.status === "denied") throw new MediaError("Active administrator membership is required.", 403);
  throw new MediaError(state.status === "configuration" ? "Configure Supabase before using the Media Library." : "The authentication service is unavailable. Please try again.", 503);
}

/** Cookie-authenticated mutations accept JSON from this origin only. */
export function assertMediaOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  try {
    const parsed = new URL(origin || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.origin !== origin || parsed.host !== host || (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))) throw new Error();
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error();
  } catch {
    throw new MediaError("This operation must be requested from the admin application.", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new MediaError("Send application/json metadata; file bytes must upload directly to R2.", 415);
  }
}

export function parseMediaQuery(url: URL) {
  const pageText = url.searchParams.get("page") || "1";
  const page = Number(pageText);
  if (!/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page < 1 || page > 100000) throw new MediaError("Invalid page number.");
  const type = (url.searchParams.get("type") || "all") as MediaType | "all";
  if (!["all", "image", "video", "audio", "document"].includes(type)) throw new MediaError("Invalid file-type filter.");
  const sort = url.searchParams.get("sort") || "newest";
  if (!["newest", "oldest", "name", "size"].includes(sort)) throw new MediaError("Invalid sort order.");
  const search = (url.searchParams.get("search") || "").trim();
  if (search.length > 120) throw new MediaError("Search must be 120 characters or fewer.");
  // PostgREST logic-tree syntax must never be supplied by a search input.
  const safeSearch = search.normalize("NFKC").replace(/[^\p{L}\p{N} ._-]/gu, " ").trim().replace(/[ _]+/g, " ");
  return { page, type, sort, search: safeSearch, pageSize: 24 };
}

export function assertAssetId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new MediaError("Invalid asset identifier.");
  return id;
}
