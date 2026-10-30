import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./lib/supabase/config";
import type { Database } from "./lib/supabase/database.types";
import { supabaseFetch } from "./lib/supabase/fetch";

/** Refresh only; page/action authorization always checks identity and membership. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const configuration = getSupabaseConfig();

  if (configuration.configured) {
    const client = createServerClient<Database>(
      configuration.url,
      configuration.publishableKey,
      {
        cookieOptions: {
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
        global: { fetch: supabaseFetch },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet, cacheHeaders) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            const previous = response;
            response = NextResponse.next({ request });
            // Keep every chunk and every write, including earlier setAll calls.
            previous.cookies
              .getAll()
              .forEach((cookie) => response.cookies.set(cookie));
            for (const header of ["cache-control", "expires", "pragma"]) {
              const value = previous.headers.get(header);
              if (value) response.headers.set(header, value);
            }
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
            Object.entries(cacheHeaders).forEach(([name, value]) =>
              response.headers.set(name, value),
            );
          },
        },
      },
    );
    try {
      await client.auth.getClaims();
    } catch {
      // Never grant access here. Server checks produce an unavailable/signed-out state.
    }
  }

  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
