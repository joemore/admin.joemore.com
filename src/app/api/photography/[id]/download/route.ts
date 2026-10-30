import { photographyRoute } from "@/lib/photography/http";
import { mediaJson } from "@/lib/media/http";
import { createPhotographyService } from "@/lib/photography/service";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{id:string}> }) {
  return photographyRoute(request, async (context) => {
    const service = createPhotographyService({ ...context.services(), userId: context.admin.userId });
    return mediaJson({url:await service.download((await params).id)});
  });
}

