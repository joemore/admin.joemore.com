import { mediaJson, mediaRoute } from "@/lib/media/http";
import { publicUrl } from "@/lib/media/keys";
import { MediaError } from "@/lib/media/types";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return mediaRoute(request, async (context) => {
    const { r2, config } = context.services();
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (key !== null) {
      if (!key || key.length > 1024 || /[\u0000-\u001f\u007f\\]/.test(key) || key.split("/").some((part) => [".", ".."].includes(part))) throw new MediaError("Invalid object key.");
      const head = await r2.head(key);
      if (!head) throw new MediaError("The object could not be found.", 404);
      return mediaJson({ object: { key, size: head.size, lastModified: head.lastModified, etag: head.etag, contentType: head.mimeType, publicUrl: publicUrl(config.publicBaseUrl, key) } });
    }
    return mediaJson(await r2.list(url.searchParams.get("prefix") || "", url.searchParams.get("cursor") || undefined));
  });
}
