import { photographyRoute } from "@/lib/photography/http";
import { mediaJson } from "@/lib/media/http";
import { createPhotographyService } from "@/lib/photography/service";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) {
  return photographyRoute(request, async (context) => {
    const service = createPhotographyService({ ...context.services(), userId: context.admin.userId });
    await service.abort((await params).id); return mediaJson({cancelled:true});
  });
}

