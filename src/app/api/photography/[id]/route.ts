import { expectedUpdatedAt, photographyBody, photographyJson, photographyRoute, photographyView } from "@/lib/photography/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { MediaError } from "@/lib/media/types";
import { validateIds, validatePhotographyMetadata } from "@/lib/photography/validation";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  return photographyRoute(request, async (context) => {
    const row = await context.store.get(assertAssetId((await params).id));
    if (!row) throw new MediaError("Photograph not found.", 404);
    return photographyJson({ item: await photographyView(row, context) });
  });
}
export async function PATCH(request: Request, { params }: Params) {
  return photographyRoute(request, async (context) => {
    const body = await photographyBody(request);
    if ("status" in body || "published_at" in body) throw new MediaError("Use the publishing operation to change publication status.");
    if ("gps_reviewed" in body && typeof body.gps_reviewed !== "boolean") throw new MediaError("Invalid original-metadata acknowledgement.");
    const rows = await context.store.editItems({ ids: [assertAssetId((await params).id)], metadata: validatePhotographyMetadata(body.metadata || {}), tagIds: "tag_ids" in body ? validateIds(body.tag_ids, 200) : undefined, albumIds: "album_ids" in body ? validateIds(body.album_ids) : undefined, expectedUpdatedAt: expectedUpdatedAt(body), gpsReviewed: body.gps_reviewed === true });
    if (!rows[0]) throw new MediaError("Photograph not found.", 404);
    return photographyJson({ item: await photographyView(rows[0], context) });
  });
}
