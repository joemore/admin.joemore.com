import { photographyBody, photographyJson, photographyRoute } from "@/lib/photography/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { validateTag } from "@/lib/photography/validation";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return photographyRoute(request, async ({ store }) => {
  const tag = validateTag((await photographyBody(request)).name);
  return photographyJson({ tag: await store.renameTag(assertAssetId((await params).id), tag.name, tag.slug) });
}); }
