import { assetView, mediaBody, mediaJson, mediaRoute } from "@/lib/media/http";
import { assertAssetId } from "@/lib/media/http-policy";
import { mediaDatabaseError } from "@/lib/media/store";
import { MediaError } from "@/lib/media/types";
import { validateMetadata } from "@/lib/media/validation";

export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mediaRoute(request, async (context) => {
    const { config } = context.services();
    const patch = validateMetadata(await mediaBody(request));
    const { data, error } = await context.client.from("media_assets").update(patch).eq("id", assertAssetId((await params).id)).eq("status", "ready").select("*").maybeSingle();
    if (error) mediaDatabaseError(error);
    if (!data) throw new MediaError("This asset is unavailable or is no longer ready for editing.", 409);
    return mediaJson({ asset: assetView(data, config.publicBaseUrl) });
  });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mediaRoute(request, async (context) => {
    const body = await mediaBody(request);
    if (body.confirm !== true) throw new MediaError("Explicit confirmation is required: deleting a CDN asset can break pages that reference it.");
    const { service, config } = context.services();
    return mediaJson({ asset: assetView(await service.delete(assertAssetId((await params).id)), config.publicBaseUrl) });
  });
}
