import type { SignedUpload } from "../media/types";

export type PhotographyMetadata = {
  title: string; caption: string | null; description: string | null; alt_text: string | null;
  date_taken: string | null; capture_local: string | null; capture_timezone: string | null;
  camera_make: string | null; camera_model: string | null; lens_model: string | null;
  aperture: number | null; shutter_speed: string | null; iso: number | null; focal_length: number | null;
  exposure_compensation: number | null; camera_settings: Record<string, unknown>;
  latitude: number | null; longitude: number | null; altitude: number | null;
  location_name: string | null; country: string | null; region: string | null;
  location_visibility: "hidden" | "approximate" | "exact";
  featured: boolean; allow_original_download: boolean; display_order: number | null;
  width: number | null; height: number | null; duration_ms: number | null; orientation: number | null;
};
export type PhotographyItem = PhotographyMetadata & {
  id: string; media_asset_id: string | null; media_type: "photo" | "video"; original_filename: string;
  original_key: string; original_mime_type: string; original_size: number; fingerprint: string;
  original_has_gps: boolean; original_gps_reviewed: boolean;
  preview_key: string; preview_mime_type: string; preview_size: number;
  thumbnail_key: string; thumbnail_size: number; poster_key: string | null; poster_size: number | null;
  public_key: string | null; public_thumbnail_key: string | null; public_poster_key: string | null;
  status: "draft" | "published"; storage_status: "pending" | "uploading" | "ready" | "failed" | "publishing" | "unpublishing" | "cleanup";
  upload_state: Record<string, string>; upload_expires_at: string; error_message: string | null;
  published_at: string | null; uploaded_by: string; created_at: string; updated_at: string;
};
export type PhotographyTag = { id: string; name: string; slug: string; created_at: string };
export type PhotographyAlbum = { id: string; title: string; slug: string; description: string | null; cover_item_id: string | null; display_order: number; status: "draft" | "published"; published_at: string | null; created_at: string; updated_at: string };
export type PhotographyItemTag = { item_id: string; tag_id: string };
export type PhotographyAlbumItem = { album_id: string; item_id: string; sort_position: number };
/** Admin DTO: private storage keys and multipart IDs are never sent to the browser. */
export type PhotographyView = Omit<PhotographyItem, "original_key" | "preview_key" | "thumbnail_key" | "poster_key" | "upload_state"> & {
  preview_url: string | null; thumbnail_url: string | null; poster_url: string | null;
  public_url: string | null; tags: PhotographyTag[]; album_ids: string[];
};
export type PhotographyList = { items: PhotographyView[]; count: number; page: number; pageSize: number };
export type PhotographyCatalog = { tags: PhotographyTag[]; albums: PhotographyAlbum[] };
export type PhotographyUploadFile = { filename: string; mimeType: string; sizeBytes: number };
export type PhotographyImportRequest = {
  original: PhotographyUploadFile; preview: PhotographyUploadFile; thumbnail: PhotographyUploadFile;
  poster?: PhotographyUploadFile; fingerprint: string; originalHasGps: boolean; metadata: Partial<PhotographyMetadata>;
};
export type PhotographyUploadRole = "original" | "preview" | "thumbnail" | "poster";
export type PhotographyUploadPermission = { role: PhotographyUploadRole; mode: "single" | "multipart"; upload?: SignedUpload; partSize: number; partCount: number };
export type PhotographyUploadTicket = { id: string; files: PhotographyUploadPermission[] };
