export type SignedUpload = { url: string; headers: Record<string, string> };

export class MediaRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function mediaRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new MediaRequestError(data?.error ?? "The request could not be completed. Please try again.", response.status);
  }
  return data as T;
}

export function uploadBytes(
  permission: SignedUpload,
  bytes: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal.aborted) return reject(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", permission.url);
    xhr.timeout = 15 * 60_000;
    Object.entries(permission.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new MediaRequestError(xhr.status === 412
        ? "This upload already exists. Try verifying it, or retry with a new upload."
        : "R2 could not accept the upload. Check your connection and bucket CORS policy.", xhr.status));
    };
    xhr.onerror = () => { cleanup(); reject(new MediaRequestError("Upload connection failed. Check your connection and bucket CORS policy.", 0)); };
    xhr.ontimeout = () => { cleanup(); reject(new MediaRequestError("The upload timed out. Please retry.", 0)); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    xhr.send(bytes);
  });
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3);
  return `${(size / 1024 ** index).toFixed(index === 1 ? 0 : 1)} ${["B", "KB", "MB", "GB"][index]}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

/** Read bounded headers before decoding. Unsupported/oversized images keep their original upload. */
export async function prepareThumbnail(file: File): Promise<{ blob?: Blob; width?: number; height?: number }> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024 || typeof createImageBitmap !== "function") return {};
  try {
    const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let width = 0;
    let height = 0;
    if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
      width = view.getUint32(16); height = view.getUint32(20);
    } else if (bytes.length >= 10 && String.fromCharCode(...bytes.slice(0, 3)) === "GIF") {
      width = view.getUint16(6, true); height = view.getUint16(8, true);
    } else if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
      const kind = String.fromCharCode(...bytes.slice(12, 16));
      if (kind === "VP8X") {
        width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      } else if (kind === "VP8 " && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
        width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
      } else if (kind === "VP8L" && bytes[20] === 47) {
        width = 1 + ((bytes[22] & 0x3f) << 8 | bytes[21]);
        height = 1 + ((bytes[24] & 0xf) << 10 | bytes[23] << 2 | (bytes[22] >> 6));
      }
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      let offset = 2;
      while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 255) break;
        const marker = bytes[offset + 1];
        if (marker === 218 || marker === 217) break;
        if (marker === 255) { offset++; continue; }
        const length = view.getUint16(offset + 2);
        if (length < 2) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          height = view.getUint16(offset + 5); width = view.getUint16(offset + 7); break;
        }
        offset += length + 2;
      }
    }
    if (!width || !height || width > 16000 || height > 16000 || width * height > 24_000_000) return {};
    const bitmap = await createImageBitmap(file, { resizeWidth: Math.min(width, 400), resizeQuality: "high" });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) return { width, height };
      context.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78));
      return { width, height, blob: blob?.type === "image/webp" && blob.size <= 1024 * 1024 ? blob : undefined };
    } finally { bitmap.close(); }
  } catch { return {}; }
}
