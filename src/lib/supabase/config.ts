export type SupabaseConfig =
  | { configured: true; url: string; anonKey: string }
  | { configured: false; reason: "missing" | "invalid-url" | "invalid-key" };

/** Public configuration only. Never add a secret key to this module. */
export function parseSupabaseConfig(
  url: string | undefined,
  anonKey: string | undefined,
): SupabaseConfig {
  if (!url?.trim() || !anonKey?.trim()) {
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

  // Configuration sanity check only, NOT signature verification or authorization.
  // Supabase verifies the actual API key. Refuse privileged or user-session JWTs.
  if (!isLegacyAnonKey(anonKey.trim())) {
    return { configured: false, reason: "invalid-key" };
  }

  return {
    configured: true,
    url: url.trim().replace(/\/$/, ""),
    anonKey: anonKey.trim(),
  };
}

function isLegacyAnonKey(key: string): boolean {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const decode = (segment: string) => JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")));
    const [header, payload] = key.split(".");
    return decode(header)?.alg === "HS256" && decode(payload)?.role === "anon";
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): SupabaseConfig {
  // Keep direct property access: Next.js substitutes NEXT_PUBLIC_* at build time.
  return parseSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
