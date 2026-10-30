import { mediaJson, mediaRoute } from "@/lib/media/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return mediaRoute(request, async (context) => mediaJson(await context.services().service.cleanup(25)));
}
