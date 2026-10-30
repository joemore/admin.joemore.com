import { photographyRoute, photographyBody, photographyView } from "@/lib/photography/http";
import { mediaJson } from "@/lib/media/http";
import { createPhotographyService } from "@/lib/photography/service";
import { MediaError } from "@/lib/media/types";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{id:string}> }) {
  return photographyRoute(request, async (context) => {
    const body = await photographyBody(request), id = (await params).id;
    const service = createPhotographyService({ ...context.services(), userId: context.admin.userId });
    if (body.action !== "publish" && body.action !== "unpublish") throw new MediaError("Choose publish or unpublish.");
    const row = await (body.action === "publish" ? service.publish(id) : service.unpublish(id));
    return mediaJson({item:await photographyView(row,context)});
  });
}

