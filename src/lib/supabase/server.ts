import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database.types";
import { supabaseFetch } from "./fetch";

export async function createServerSupabaseClient(options?: {
  writableCookies?: boolean;
}) {
  const config = getSupabaseConfig();
  if (!config.configured) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    global: { fetch: supabaseFetch },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // Server Components cannot set cookies. Proxy refreshes before rendering.
        // Actions explicitly opt into writes; failures there must propagate.
        if (!options?.writableCookies) return;
        cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
          cookieStore.set(name, value, cookieOptions);
        });
      },
    },
  });
}
