import { photographyBody, photographyJson, photographyRoute } from "@/lib/photography/http";
import { validateTag } from "@/lib/photography/validation";
export const runtime = "nodejs";
export async function POST(request: Request) { return photographyRoute(request, async ({ store }) => {
  const tag = validateTag((await photographyBody(request)).name);
  return photographyJson({ tag: await store.createTag(tag.name, tag.slug) }, 201);
}); }
