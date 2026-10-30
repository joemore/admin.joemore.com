export type MediaConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  prefix: string;
  maxFileSize: number;
  multipartThreshold: number;
  partSize: number;
  signedUrlSeconds: number;
  sessionSeconds: number;
};
export type MediaConfiguration = { configured: true; config: MediaConfig; missing: [] } | { configured: false; config: null; missing: string[] };

/** Called only in server entry points; safe to inspect without credentials at build time. */
export function getMediaConfig(env: Record<string, string | undefined> = process.env): MediaConfiguration {
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SUPABASE_SECRET_KEY"].filter((key) => !env[key]?.trim());
  const prefix = env.R2_UPLOAD_PREFIX?.trim() || "u/";
  // The schema and cleanup safeguards deliberately reserve this namespace only.
  if (prefix !== "u/") missing.push("R2_UPLOAD_PREFIX (must be u/)");
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim() || "https://cdn.joemore.com";
  try {
    const url = new URL(publicBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error();
  } catch { missing.push("R2_PUBLIC_BASE_URL (valid HTTPS origin)"); }
  const bucket = env.R2_BUCKET_NAME?.trim() || "joemore-com-cdn";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) missing.push("R2_BUCKET_NAME (valid bucket name)");
  if (env.R2_ACCOUNT_ID && !/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID.trim())) missing.push("R2_ACCOUNT_ID (32 hexadecimal characters)");
  const maxFileSize = Number(env.R2_MAX_FILE_SIZE_BYTES || 2 * 1024 ** 3);
  if (!Number.isSafeInteger(maxFileSize) || maxFileSize < 1 || maxFileSize > 5 * 1024 ** 4) missing.push("R2_MAX_FILE_SIZE_BYTES (positive integer, at most 5 TiB)");
  if (missing.length) return { configured: false, config: null, missing };
  return {
    configured: true, missing: [], config: {
      accountId: env.R2_ACCOUNT_ID!.trim(), accessKeyId: env.R2_ACCESS_KEY_ID!.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
      bucket, publicBaseUrl: publicBaseUrl.replace(/\/$/, ""), prefix, maxFileSize,
      multipartThreshold: 64 * 1024 ** 2, partSize: Math.max(16 * 1024 ** 2, Math.ceil(maxFileSize / 10000 / 1024 ** 2) * 1024 ** 2),
      signedUrlSeconds: 600, sessionSeconds: 24 * 60 * 60,
    },
  };
}
