import { photographyJson, photographyRoute, photographyViews } from "@/lib/photography/http";
import { parsePhotographyQuery } from "@/lib/photography/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return photographyRoute(request, async (context) => {
    const filters = parsePhotographyQuery(new URL(request.url));
    const { items, count } = await context.store.list(filters);
    return photographyJson({ items: await photographyViews(items, context), count, page: filters.page, pageSize: filters.pageSize });
  });
}
