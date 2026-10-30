import { mediaRoute } from "@/lib/media/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { assertManagedKey } from "@/lib/media/keys";
import { MediaError } from "@/lib/media/types";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mediaRoute(request, async (context) => {
    const { store, r2 } = context.services();
    const asset = await store.get(assertAssetId((await params).id));
    if (!asset || asset.status !== "ready") throw new MediaError("This asset is unavailable for download.", 404);
    assertManagedKey(asset.storage_key);
    const url = await r2.downloadUrl(asset.storage_key, asset.original_filename);
    return new Response(null, { status: 307, headers: { Location: url, "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
  });
}
