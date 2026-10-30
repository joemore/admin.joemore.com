import { photographyBody, photographyJson, photographyRoute, photographyViews } from "@/lib/photography/http";
import { validateIds, validatePhotographyMetadata } from "@/lib/photography/validation";
import { MediaError } from "@/lib/media/types";
export const runtime = "nodejs";
export async function POST(request: Request) { return photographyRoute(request, async (context) => {
  const body = await photographyBody(request);
  const ids = validateIds(body.ids);
  if (!ids.length) throw new MediaError("Select photographs before applying a bulk edit.");
  const metadata = validatePhotographyMetadata(body.metadata || {});
  if ("allow_original_download" in metadata || "gps_reviewed" in body || "status" in body) throw new MediaError("Review download permissions and publishing separately for each photograph.");
  const rows = await context.store.editItems({ ids, metadata, tagIds: "tag_ids" in body ? validateIds(body.tag_ids, 200) : undefined, albumIds: "album_ids" in body ? validateIds(body.album_ids) : undefined, assignmentMode: "add" });
  return photographyJson({ items: await photographyViews(rows, context), updated: rows.length });
}); }
