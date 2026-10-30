import { photographyJson, photographyRoute } from "@/lib/photography/http";
export const runtime = "nodejs";
export async function GET(request: Request) { return photographyRoute(request, async ({ store }) => photographyJson(await store.catalog())); }
