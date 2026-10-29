"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database.types";
import { supabaseFetch } from "./fetch";

export function createBrowserSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config.configured) return null;

  return createBrowserClient<Database>(config.url, config.anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    global: { fetch: supabaseFetch },
  });
}
