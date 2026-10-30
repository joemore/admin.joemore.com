import { assetView, mediaBody, mediaJson, mediaRoute } from "@/lib/media/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return mediaRoute(request, async (context) => {
    const { service, config } = context.services();
    const ticket = await service.initiate(await mediaBody(request));
    return mediaJson({ ...ticket, asset: assetView(ticket.asset, config.publicBaseUrl) }, 201);
  });
}
