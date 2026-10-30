import { mediaBody, mediaJson, mediaRoute } from "@/lib/media/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { MediaError } from "@/lib/media/types";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mediaRoute(request, async (context) => {
    const id = assertAssetId((await params).id);
    const body = await mediaBody(request);
    if (typeof body.partNumber !== "number") throw new MediaError("A numeric part number is required.");
    return mediaJson(await context.services().service.signPart(id, body.partNumber));
  });
}
