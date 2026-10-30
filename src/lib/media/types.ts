export type MediaType = "image" | "video" | "audio" | "document";
export type MediaStatus = "pending" | "completing" | "ready" | "failed" | "deleting" | "delete_failed" | "deleted";

export type MediaAsset = {
  id: string;
  storage_key: string;
  original_filename: string;
  display_name: string;
  description: string | null;
  alt_text: string | null;
  mime_type: string;
  media_type: MediaType;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  thumbnail_key: string | null;
  thumbnail_size_bytes: number | null;
  etag: string | null;
  status: MediaStatus;
  uploaded_by: string;
  upload_id: string | null;
  upload_expires_at: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type UploadRequest = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  displayName?: string;
  description?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailSizeBytes?: number;
};

export type SignedUpload = { url: string; headers: Record<string, string> };
export type UploadTicket = {
  asset: MediaAsset;
  mode: "single" | "multipart";
  upload?: SignedUpload;
  thumbnail?: SignedUpload;
  partSize: number;
  partCount: number;
  publicUrl: string;
};

export type ExistingR2Object = {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
  publicUrl: string;
};
export type ExistingR2Page = { objects: ExistingR2Object[]; prefixes: string[]; nextCursor: string | null; prefix: string };

export class MediaError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "media_error") {
    super(message);
    this.name = "MediaError";
  }
}
