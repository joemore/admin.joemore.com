import { photographyRoute, photographyView } from "@/lib/photography/http";
import { mediaJson } from "@/lib/media/http";
import { createPhotographyService } from "@/lib/photography/service";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) {
  return photographyRoute(request, async (context) => {
    const service = createPhotographyService({ ...context.services(), userId: context.admin.userId });
    const row = await service.complete((await params).id);
    return mediaJson({item: await photographyView(row, context)});
  });
}

