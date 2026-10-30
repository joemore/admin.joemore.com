import { assetView, mediaJson, mediaRoute } from "@/lib/media/http";
import { parseMediaQuery } from "@/lib/media/http-policy";
import { mediaDatabaseError } from "@/lib/media/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return mediaRoute(request, async ({ client, configuration }) => {
    const { page, pageSize, type, sort, search } = parseMediaQuery(new URL(request.url));
    if (!configuration.configured) return mediaJson({ configured: false, missing: configuration.missing, assets: [], total: 0, page, pageSize, maxFileSize: 2 * 1024 ** 3, publicBaseUrl: "https://cdn.joemore.com" });
    let query = client.from("media_assets").select("*", { count: "exact" }).neq("status", "deleted");
    if (type !== "all") query = query.eq("media_type", type);
    if (search) query = query.or(`display_name.ilike.%${search}%,original_filename.ilike.%${search}%`);
    const column = sort === "name" ? "display_name" : sort === "size" ? "size_bytes" : "created_at";
    query = query.order(column, { ascending: sort === "oldest" || sort === "name" }).order("id", { ascending: true }).range((page - 1) * pageSize, page * pageSize - 1);
    const { data, count, error } = await query;
    if (error) mediaDatabaseError(error);
    return mediaJson({ configured: true, assets: (data || []).map((asset) => assetView(asset, configuration.config.publicBaseUrl)), total: count || 0, page, pageSize, publicBaseUrl: configuration.config.publicBaseUrl, maxFileSize: configuration.config.maxFileSize });
  });
}
