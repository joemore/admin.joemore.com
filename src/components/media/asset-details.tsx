"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, FileArchive, FileText, ImageIcon, LoaderCircle, Music2, Save, Trash2, Video, X } from "lucide-react";
import type { MediaAsset } from "@/lib/media/types";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { formatBytes, formatDate, mediaRequest } from "./client";

export type MediaItem = MediaAsset & { public_url: string; thumbnail_url: string | null };

export function FileIcon({ type, size = 30 }: { type: string; size?: number }) {
  const Icon = type === "image" ? ImageIcon : type === "video" ? Video : type === "audio" ? Music2 : type === "application/zip" ? FileArchive : FileText;
  return <Icon size={size} strokeWidth={1.4} />;
}

export function MediaThumbnail({ asset }: { asset: MediaItem }) {
  const [failed, setFailed] = useState(false);
  return <div className={`media-thumbnail type-${asset.media_type}`}>
    {asset.thumbnail_url && asset.status === "ready" && !failed
      // Thumbnails are already resized WebP assets; loading them directly keeps originals untouched.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={asset.thumbnail_url} alt={asset.alt_text ?? ""} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <FileIcon type={asset.media_type} />}
    <span className="media-type-mark">{asset.mime_type.split("/").pop()}</span>
  </div>;
}

function AssetPreview({ asset }: { asset: MediaItem }) {
  const [failed, setFailed] = useState(false);
  if (asset.status !== "ready") return <div className="media-preview-placeholder"><FileIcon type={asset.media_type} size={46} /><p>Preview available after upload verification.</p></div>;
  if (failed) return <div className="media-preview-placeholder"><FileIcon type={asset.media_type} size={46} /><p>This browser cannot preview this format.</p><a className="text-link" href={asset.public_url} target="_blank" rel="noopener noreferrer">Open public file <ArrowUpRight size={14} /></a></div>;
  if (asset.media_type === "image") {
    // The detail preview loads on demand; gallery cards only load generated thumbnails.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnail_url ?? asset.public_url} alt={asset.alt_text ?? asset.display_name} onError={() => setFailed(true)} />;
  }
  if (asset.media_type === "video") return <video controls playsInline preload="metadata" src={asset.public_url} onError={() => setFailed(true)} aria-label={asset.display_name}>Your browser cannot preview this video.</video>;
  if (asset.media_type === "audio") return <div className="media-audio-preview"><FileIcon type="audio" size={52} /><audio controls preload="metadata" src={asset.public_url} onError={() => setFailed(true)} aria-label={asset.display_name}>Your browser cannot preview this audio.</audio></div>;
  return <div className="media-preview-placeholder"><FileIcon type={asset.mime_type} size={52} /><p>{asset.mime_type === "application/pdf" ? "PDF document" : "Downloadable file"}</p><a className="text-link" href={asset.public_url} target="_blank" rel="noopener noreferrer">Open public file <ArrowUpRight size={14} /></a></div>;
}

export function AssetDetails({ asset, onClose, onChanged }: { asset: MediaItem; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(asset.display_name);
  const [description, setDescription] = useState(asset.description ?? "");
  const [alt, setAlt] = useState(asset.alt_text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    // Removing the dialog on unmount also removes it from the top layer.
    // Calling close() in cleanup fires onClose during Strict Mode replay.
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await mediaRequest(`/api/media/${asset.id}`, { method: "PATCH", body: JSON.stringify({ displayName: name, description, altText: alt }) });
      setNotice("Changes saved. The public URL stays the same.");
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Changes could not be saved."); }
    finally { setBusy(false); }
  }

  async function deleteAsset() {
    if (!confirmed) return;
    setBusy(true); setError("");
    try {
      await mediaRequest(`/api/media/${asset.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      onChanged(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Deletion could not be completed. The asset remains tracked; retry when services recover."); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="media-dialog" aria-labelledby="media-detail-title" onClose={onClose} onCancel={(event) => { if (busy) event.preventDefault(); }}>
    <div className="media-dialog-heading"><div><span className="eyebrow">ASSET DETAILS</span><h2 id="media-detail-title">{asset.display_name}</h2></div><button className="icon-button" type="button" aria-label="Close asset details" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    <div className="media-dialog-grid"><div className="media-details-main"><div className="media-preview"><AssetPreview asset={asset} /></div>
      <div className="media-public-url"><label htmlFor="media-public-url">Public CDN URL</label><div><input id="media-public-url" readOnly value={asset.public_url} onFocus={(event) => event.target.select()} /><CopyButton value={asset.public_url} label="Copy public CDN URL" /></div></div>
      {asset.status === "ready" && <div className="media-actions"><a className="media-button" href={asset.public_url} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={14} />Open public file</a><a className="media-button" href={`/api/media/${asset.id}/download`}><Download size={14} />Download original</a></div>}
      <dl className="media-metadata"><div><dt>Original filename</dt><dd>{asset.original_filename}</dd></div><div><dt>MIME type</dt><dd><code>{asset.mime_type}</code></dd></div><div><dt>File size</dt><dd>{formatBytes(asset.size_bytes)} <span>({asset.size_bytes.toLocaleString()} bytes)</span></dd></div>{asset.width && asset.height ? <div><dt>Dimensions</dt><dd>{asset.width} × {asset.height} px</dd></div> : null}{asset.duration_ms ? <div><dt>Duration</dt><dd>{(asset.duration_ms / 1000).toFixed(1)} seconds</dd></div> : null}<div><dt>Uploaded</dt><dd>{formatDate(asset.created_at)}</dd></div><div><dt>Status</dt><dd><Badge tone={asset.status === "ready" ? "success" : "warning"}>{asset.status.replaceAll("_", " ")}</Badge></dd></div><div><dt>R2 object key</dt><dd><code>{asset.storage_key}</code><CopyButton value={asset.storage_key} label="Copy exact R2 object key" /></dd></div>{asset.etag && <div><dt>ETag</dt><dd><code>{asset.etag}</code></dd></div>}</dl>
    </div><div className="media-details-editor"><form onSubmit={(event) => void save(event)} className="media-edit-form"><h3>Make it easy to find.</h3><p>Update the details while keeping the permanent public URL.</p><label htmlFor="media-name">Display name<input id="media-name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label><label htmlFor="media-description">Description<textarea id="media-description" rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A little context for this asset…" /></label>{asset.media_type === "image" && <label htmlFor="media-alt">Alt text<textarea id="media-alt" rows={3} maxLength={1000} value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Describe the image for people who cannot see it." /></label>}<button className="button button-primary" disabled={busy || asset.status !== "ready"} type="submit">{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save details</button><p className="media-success" role="status">{notice}</p></form>
      {(asset.status === "ready" || asset.status === "delete_failed") && <div className="media-delete-area"><h3>Delete asset</h3><p>Remove the original and its thumbnail from the CDN. Recent uploads need a 10-minute wait before deletion.</p>{!deleting ? <button className="media-button media-danger" type="button" onClick={() => setDeleting(true)}><Trash2 size={14} />{asset.status === "delete_failed" ? "Retry deletion" : "Delete asset"}</button> : <div className="media-delete-confirm"><p><strong>Deleting this CDN asset may break pages that reference it.</strong> This permanently removes the original and its thumbnail.</p><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand and want to delete this asset.</label><div className="media-actions"><button type="button" className="media-button media-danger" disabled={!confirmed || busy} onClick={() => void deleteAsset()}><Trash2 size={14} />Delete permanently</button><button type="button" className="media-button" disabled={busy} onClick={() => { setDeleting(false); setConfirmed(false); }}>Cancel</button></div></div>}</div>}
      {asset.error_message && <p className="media-inline-error">{asset.error_message}</p>}{error && <p className="media-inline-error" role="alert">{error}</p>}
    </div></div>
  </dialog>;
}
