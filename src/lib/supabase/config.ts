export type SupabaseConfig =
  | { configured: true; url: string; publishableKey: string }
  | { configured: false; reason: "missing" | "invalid-url" | "invalid-key" };

/** Public configuration only. Never add a secret key to this module. */
export function parseSupabaseConfig(
  url: string | undefined,
  publishableKey: string | undefined,
): SupabaseConfig {
  if (!url?.trim() || !publishableKey?.trim()) {
    return { configured: false, reason: "missing" };
  }

  try {
    const parsed = new URL(url.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" &&
        !(local && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    ) {
      return { configured: false, reason: "invalid-url" };
    }
  } catch {
    return { configured: false, reason: "invalid-url" };
  }

  // This is a format check only. Supabase verifies the key and user identity.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey.trim())) {
    return { configured: false, reason: "invalid-key" };
  }

  return {
    configured: true,
    url: url.trim().replace(/\/$/, ""),
    publishableKey: publishableKey.trim(),
  };
}

export function getSupabaseConfig(): SupabaseConfig {
  // Keep direct property access: Next.js substitutes NEXT_PUBLIC_* at build time.
  return parseSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
