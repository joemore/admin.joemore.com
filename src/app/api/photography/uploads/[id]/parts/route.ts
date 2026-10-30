import { photographyRoute, photographyBody } from "@/lib/photography/http";
import { mediaJson } from "@/lib/media/http";
import { createPhotographyService } from "@/lib/photography/service";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) {
  return photographyRoute(request, async (context) => {
    const body = await photographyBody(request);
    const service = createPhotographyService({ ...context.services(), userId: context.admin.userId });
    return mediaJson({parts: await service.signParts((await params).id, body.role, body.partNumbers)});
  });
}

