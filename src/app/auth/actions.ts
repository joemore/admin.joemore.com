"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getClientAccessState } from "@/lib/auth/access";
import { accessRedirect } from "@/lib/auth/policy";
import { revokeCurrentSession } from "@/lib/auth/sign-out";
import {
  validateLogin,
  type LoginState,
  type SignOutState,
} from "@/lib/auth/validation";

export type { LoginState, SignOutState } from "@/lib/auth/validation";

export async function signInAction(
  _previous: LoginState,
  form: FormData,
): Promise<LoginState> {
  const validation = validateLogin(form);
  if (!validation.valid) return { fieldErrors: validation.fieldErrors };

  const client = await createServerSupabaseClient({ writableCookies: true });
  if (!client)
    return {
      error:
        "Sign-in is not configured yet. Complete the connection setup first.",
    };

  let destination: string;
  try {
    const { error } = await client.auth.signInWithPassword({
      email: validation.email,
      password: validation.password,
    });
    if (error) {
      if (error.status === 429 || error.code === "over_request_rate_limit") {
        return {
          error: "Too many attempts. Please wait a moment and try again.",
        };
      }
      if (
        error.status === 400 ||
        error.status === 401 ||
        error.status === 422
      ) {
        return { error: "Unable to sign in. Check your email and password." };
      }
      return {
        error:
          "The authentication service is unavailable. Please try again shortly.",
      };
    }
    const access = await getClientAccessState(client);
    destination =
      access.status === "admin" ? "/dashboard" : accessRedirect(access)!;
  } catch {
    return {
      error:
        "We couldn’t reach the authentication service. Please try again shortly.",
    };
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOutAction(
  _previous: SignOutState,
  _form: FormData,
): Promise<SignOutState> {
  // Keep the same useActionState signature as sign-in; no client payload is trusted.
  void _previous;
  void _form;
  const client = await createServerSupabaseClient({ writableCookies: true });
  if (!client) redirect("/login");

  const result = await revokeCurrentSession(client);
  if (result.error) return result;

  revalidatePath("/", "layout");
  redirect("/login");
}
