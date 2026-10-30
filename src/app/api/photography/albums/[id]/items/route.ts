import { photographyBody, photographyJson, photographyRoute, photographyViews } from "@/lib/photography/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { validateIds } from "@/lib/photography/validation";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) { return photographyRoute(request, async (context) => photographyJson({ items: await photographyViews(await context.store.albumItems(assertAssetId((await params).id)), context) })); }
export async function PUT(request: Request, { params }: Params) { return photographyRoute(request, async (context) => {
  const id = assertAssetId((await params).id);
  await context.store.orderAlbum(id, validateIds((await photographyBody(request)).item_ids, 2000));
  return photographyJson({ items: await photographyViews(await context.store.albumItems(id), context) });
}); }
