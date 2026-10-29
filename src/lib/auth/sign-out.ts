import { isMissingSession } from "./policy";
import type { SignOutState } from "./validation";

type SignOutClient = {
  auth: {
    getUser: () => Promise<{ error: unknown }>;
    signOut: (options: { scope: "global" }) => Promise<{ error: unknown }>;
  };
};

/** Independently verify the caller; revoked admins must still be able to leave. */
export async function revokeCurrentSession(
  client: SignOutClient,
): Promise<SignOutState> {
  try {
    const { error } = await client.auth.getUser();
    if (error && !isMissingSession(error)) {
      return {
        error: "We couldn’t verify your session. Please try signing out again.",
      };
    }
    // Global revokes refresh sessions; existing access JWTs expire normally.
    // An absent/expired session can still have stale cookies that must be cleared.
    const { error: signOutError } = await client.auth.signOut({
      scope: "global",
    });
    if (signOutError)
      return { error: "Sign-out could not be completed. Please try again." };
    return {};
  } catch {
    return {
      error:
        "The authentication service is unavailable. Please try signing out again.",
    };
  }
}
