import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../supabase/server";
import type { Database } from "../supabase/database.types";
import {
  accessRedirect,
  resolveAccess,
  type AccessState,
  type AdminIdentity,
} from "./policy";

export type { AccessState, AdminIdentity } from "./policy";

/** Fresh identity and live membership on every check; no persistent caching. */
export async function getClientAccessState(
  client: SupabaseClient<Database>,
): Promise<AccessState> {
  return resolveAccess({
    async getVerifiedUser() {
      const { data, error } = await client.auth.getUser();
      return { data: data.user, error };
    },
    async getMembership(userId) {
      return client
        .from("admin_users")
        .select("user_id, role, is_active, created_at, created_by")
        .eq("user_id", userId)
        .maybeSingle();
    },
  });
}

export async function getAccessState(): Promise<AccessState> {
  const client = await createServerSupabaseClient();
  return client ? getClientAccessState(client) : { status: "configuration" };
}

/** Call in every protected page, action, and route handler that reads private data. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const state = await getAccessState();
  if (state.status === "admin") return state.admin;
  redirect(accessRedirect(state)!);
}
