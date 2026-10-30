import { photographyBody, photographyJson, photographyRoute } from "@/lib/photography/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { validateAlbum } from "@/lib/photography/validation";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Params) { return photographyRoute(request, async ({ store }) => photographyJson({ album: await store.updateAlbum(assertAssetId((await params).id), validateAlbum(await photographyBody(request), true)) })); }
export async function DELETE(request: Request, { params }: Params) { return photographyRoute(request, async ({ store }) => {
  await store.deleteAlbum(assertAssetId((await params).id));
  return photographyJson({ deleted: true });
}); }
