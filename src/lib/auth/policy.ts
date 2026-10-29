import type { AdminMembership, AdminRole } from "../supabase/database.types";

export type AdminIdentity = {
  userId: string;
  email: string;
  role: AdminRole;
  createdAt: string;
};
export type AccessState =
  | { status: "admin"; admin: AdminIdentity }
  | { status: "signed-out" }
  | { status: "configuration" }
  | { status: "denied" }
  | { status: "unavailable" };

type VerifiedUser = { id: string; email?: string; is_anonymous?: boolean };
type Result<T> = { data: T; error: unknown };
export type AccessDependencies = {
  getVerifiedUser: () => Promise<Result<VerifiedUser | null>>;
  getMembership: (userId: string) => Promise<Result<AdminMembership | null>>;
};

/** Distinguish an absent/expired session from an upstream outage. */
export function isMissingSession(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as { name?: string; code?: string };
  return (
    authError.name === "AuthSessionMissingError" ||
    [
      "session_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
      "invalid_jwt",
      "user_not_found",
      "user_banned",
    ].includes(authError.code ?? "")
  );
}

/** Shared decision path for pages/actions. No email or metadata can confer access. */
export async function resolveAccess(
  dependencies: AccessDependencies,
): Promise<AccessState> {
  try {
    const userResult = await dependencies.getVerifiedUser();
    if (userResult.error) {
      return {
        status: isMissingSession(userResult.error)
          ? "signed-out"
          : "unavailable",
      };
    }
    const user = userResult.data;
    if (!user) return { status: "signed-out" };
    if (user.is_anonymous) return { status: "denied" };

    const membership = await dependencies.getMembership(user.id);
    if (membership.error) return { status: "unavailable" };
    const row = membership.data;
    if (
      !row ||
      row.user_id !== user.id ||
      row.is_active !== true ||
      !["super_admin", "admin", "editor"].includes(row.role)
    ) {
      return { status: "denied" };
    }
    return {
      status: "admin",
      admin: {
        userId: user.id,
        email: user.email ?? "Administrator",
        role: row.role,
        createdAt: row.created_at,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function accessRedirect(state: AccessState): string | null {
  switch (state.status) {
    case "admin":
      return null;
    case "denied":
      return "/access-denied";
    case "unavailable":
      return "/connection-error";
    default:
      return "/login";
  }
}
