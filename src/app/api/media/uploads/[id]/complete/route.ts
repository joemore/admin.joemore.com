import { assetView, mediaJson, mediaRoute } from "@/lib/media/http";
import { assertAssetId } from "@/lib/media/http-policy";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return mediaRoute(request, async (context) => {
    const { service, config } = context.services();
    return mediaJson({ asset: assetView(await service.complete(assertAssetId((await params).id)), config.publicBaseUrl) });
  });
}
