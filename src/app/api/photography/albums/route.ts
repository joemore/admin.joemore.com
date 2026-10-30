import { photographyBody, photographyJson, photographyRoute } from "@/lib/photography/http";
import { validateAlbum } from "@/lib/photography/validation";
import type { PhotographyAlbum } from "@/lib/photography/types";
import { MediaError } from "@/lib/media/types";
export const runtime = "nodejs";
export async function GET(request: Request) { return photographyRoute(request, async ({ store }) => photographyJson({ albums: (await store.catalog()).albums })); }
export async function POST(request: Request) { return photographyRoute(request, async ({ store }) => {
  const patch = validateAlbum(await photographyBody(request));
  if (patch.cover_item_id) throw new MediaError("Add photographs to the album before choosing its cover.");
  return photographyJson({ album: await store.createAlbum(patch as Partial<PhotographyAlbum> & Pick<PhotographyAlbum, "title" | "slug">) }, 201);
}); }
