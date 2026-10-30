"use client";

/* Local object URLs intentionally preview user-selected files without a public upload. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Film, ImagePlus, LoaderCircle, RefreshCw, Upload, X } from "lucide-react";
import { formatBytes, MediaRequestError, mediaRequest, uploadBytes } from "@/components/media/client";
import { PHOTO_INPUT_ACCEPT, photographyFileKind, preparePhotography, uploadFilename, type PreparedPhotography } from "@/lib/photography/browser";
import { cameraSummary } from "@/lib/photography/metadata";
import type { PhotographyImportRequest, PhotographyUploadRole, PhotographyUploadTicket, PhotographyView } from "@/lib/photography/types";
import { PhotographyEditor } from "./editor";
import { PhotographyNav } from "./library";

type ImportRow = {
  id: string; file: File; kind: "photo" | "video"; webVideo?: File; useOriginalVideo: boolean;
  state: "queued" | "preparing" | "uploading" | "verifying" | "ready" | "failed";
  progress: number; error?: string; preview?: string; ticketId?: string;
  completionPending?: boolean; prepared?: PreparedPhotography; item?: PhotographyView;
};

const failureMessage = (error: unknown) => error instanceof Error ? error.message : "The import could not be completed. Please retry.";
const post = <T,>(path: string, body?: unknown, signal?: AbortSignal) => mediaRequest<T>(path, { method: "POST", body: JSON.stringify(body || {}), signal });

export function PhotographyImporter() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [editorId, setEditorId] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<ImportRow[]>([]);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const mounted = useRef(true);
  const update = (id: string, patch: Partial<ImportRow>) => {
    rowsRef.current = rowsRef.current.map((row) => row.id === id ? { ...row, ...patch } : row);
    if (mounted.current) setRows(rowsRef.current);
  };

  useEffect(() => {
    mounted.current = true;
    const objectUrls = urls.current;
    return () => { mounted.current = false; controller.current?.abort(); objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => {
    const hasPending = rows.some((row) => row.state !== "ready");
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasPending) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [rows]);
  useEffect(() => {
    const navigation = (event: MouseEvent) => {
      if (!rows.some((row) => row.state !== "ready") || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!window.confirm("Leave the import queue? Selected files and unfinished imports will leave this screen. Saved drafts stay in your photography library.")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", navigation, true);
    return () => document.removeEventListener("click", navigation, true);
  }, [rows]);

  function addFiles(files: FileList | File[]) {
    const messages: string[] = [];
    const additions: ImportRow[] = [];
    for (const file of Array.from(files)) {
      try {
        const kind = photographyFileKind(file);
        if ([...rowsRef.current, ...additions].some((row) => row.file.name === file.name && row.file.size === file.size && row.file.lastModified === file.lastModified)) {
          messages.push(`${file.name} is already in this queue.`); continue;
        }
        const row: ImportRow = { id: crypto.randomUUID(), file, kind, state: "queued", progress: 0, useOriginalVideo: false };
        if (kind === "photo" && file.size <= 120 * 1024 ** 2) {
          row.preview = URL.createObjectURL(file);
          urls.current.add(row.preview);
        }
        additions.push(row);
      } catch (cause) { messages.push(`${file.name}: ${failureMessage(cause)}`); }
    }
    rowsRef.current = [...rowsRef.current, ...additions];
    setRows(rowsRef.current);
    setError(messages.join(" "));
    if (additions.length) setSelected((current) => current || additions[0].id);
    if (input.current) input.current.value = "";
  }

  async function uploadRow(row: ImportRow, signal: AbortSignal) {
    try {
      if (row.completionPending && row.ticketId) {
        update(row.id, { state: "verifying", error: undefined });
        const { item } = await post<{ item: PhotographyView }>(`/api/photography/uploads/${row.ticketId}/complete`, {}, signal);
        update(row.id, { state: "ready", progress: 100, item, completionPending: false });
        return;
      }
      if (row.ticketId) {
        await post(`/api/photography/uploads/${row.ticketId}/abort`, {}, signal);
        update(row.id, { ticketId: undefined });
      }
      update(row.id, { state: "preparing", progress: 0, error: undefined });
      const prepared = row.prepared || await preparePhotography(row.file, row.useOriginalVideo ? row.file : row.webVideo);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const previewBlob = prepared.files.poster || prepared.files.preview;
      const preview = URL.createObjectURL(previewBlob);
      urls.current.add(preview);
      if (row.preview) { URL.revokeObjectURL(row.preview); urls.current.delete(row.preview); }
      update(row.id, { prepared, preview });
      const fileDescription = (role: PhotographyUploadRole) => {
        const blob = prepared.files[role];
        if (!blob) throw new Error("A required upload file is missing.");
        return { filename: uploadFilename(row.file, role, blob), mimeType: blob.type, sizeBytes: blob.size };
      };
      const request: PhotographyImportRequest = {
        original: fileDescription("original"), preview: fileDescription("preview"), thumbnail: fileDescription("thumbnail"),
        ...(prepared.files.poster ? { poster: fileDescription("poster") } : {}),
        fingerprint: prepared.fingerprint, originalHasGps: prepared.originalHasGps, metadata: prepared.metadata,
      };
      const ticket = await post<PhotographyUploadTicket>("/api/photography/uploads", request, signal);
      update(row.id, { state: "uploading", ticketId: ticket.id });
      const total = Object.values(prepared.files).reduce((sum, blob) => sum + (blob?.size || 0), 0);
      let completedBytes = 0;
      for (const permission of ticket.files) {
        const blob = prepared.files[permission.role];
        if (!blob) throw new Error("The upload permission refers to a missing file.");
        if (permission.mode === "single") {
          if (!permission.upload) throw new Error("The upload permission is incomplete.");
          await uploadBytes(permission.upload, blob, (loaded) => update(row.id, { progress: Math.min(99, Math.round((completedBytes + loaded) / total * 100)) }), signal);
          completedBytes += blob.size;
        } else {
          for (let partNumber = 1; partNumber <= permission.partCount; partNumber++) {
            const { parts } = await post<{ parts: { partNumber: number; upload: { url: string; headers: Record<string, string> } }[] }>(`/api/photography/uploads/${ticket.id}/parts`, { role: permission.role, partNumbers: [partNumber] }, signal);
            const part = parts.find((entry) => entry.partNumber === partNumber);
            if (!part) throw new Error("The multipart upload permission is incomplete.");
            const bytes = blob.slice((partNumber - 1) * permission.partSize, partNumber * permission.partSize);
            await uploadBytes(part.upload, bytes, (loaded) => update(row.id, { progress: Math.min(99, Math.round((completedBytes + loaded) / total * 100)) }), signal);
            completedBytes += bytes.size;
          }
        }
      }
      update(row.id, { state: "verifying", completionPending: true });
      const { item } = await post<{ item: PhotographyView }>(`/api/photography/uploads/${ticket.id}/complete`, {}, signal);
      update(row.id, { state: "ready", progress: 100, item, completionPending: false });
    } catch (cause) {
      const restart = cause instanceof MediaRequestError && (cause.status === 422 || cause.status === 410 || (cause.status === 409 && /expired|parts are missing|uploaded file is missing|sizes differ/i.test(cause.message)));
      update(row.id, { state: "failed", ...(restart ? { completionPending: false } : {}), error: signal.aborted ? "Import paused. Retry when you are ready." : failureMessage(cause) });
    }
  }

  async function run(ids?: string[]) {
    if (controller.current) return;
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    try {
      const pending = rowsRef.current.filter((row) => (!ids || ids.includes(row.id)) && ["queued", "failed"].includes(row.state));
      for (const candidate of pending) {
        if (next.signal.aborted) break;
        const current = rowsRef.current.find((row) => row.id === candidate.id);
        if (current) await uploadRow(current, next.signal);
      }
    } finally { controller.current = null; if (mounted.current) setBusy(false); }
  }

  async function remove(row: ImportRow) {
    if (busy) return;
    try {
      if (row.ticketId && !row.item) {
        try { await post(`/api/photography/uploads/${row.ticketId}/abort`); }
        catch (cause) {
          if (!(cause instanceof MediaRequestError) || cause.status !== 409) throw cause;
          const { item } = await mediaRequest<{ item: PhotographyView }>(`/api/photography/${row.ticketId}`);
          if (item.storage_status !== "ready") throw cause;
          // A completed request may have lost its response. Removing the queue
          // entry leaves the saved draft intact in the photography library.
        }
      }
      if (row.preview) { URL.revokeObjectURL(row.preview); urls.current.delete(row.preview); }
      rowsRef.current = rowsRef.current.filter((candidate) => candidate.id !== row.id);
      setRows(rowsRef.current);
      if (selected === row.id) setSelected(rowsRef.current[0]?.id);
    } catch (cause) { setError(failureMessage(cause)); }
  }

  const current = rows.find((row) => row.id === selected);
  const completed = rows.flatMap((row) => row.item ? [row.item] : []);
  const pendingCount = rows.filter((row) => row.state === "queued" || row.state === "failed").length;
  return <div className="photo-workspace photo-importer">
    <div className="page-heading"><div><p className="eyebrow">PHOTOGRAPHY / IMPORT</p><h1>Bring your moments in.</h1><p>Keep the originals. Make room for the story.</p></div><Link className="media-button" href="/photography"><ArrowLeft size={15} /> Photography library</Link></div>
    <PhotographyNav current="upload" />
    <div className={`photo-import-dropzone ${dragging ? "drag-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
      <ImagePlus size={34} /><h2>Drop photographs and timelapse videos</h2><p>JPEG, PNG, WebP, AVIF, GIF, MP4 and WebM · Originals stay private · Drafts by default</p>
      <input ref={input} type="file" multiple accept={PHOTO_INPUT_ACCEPT} hidden onChange={(event) => event.target.files && addFiles(event.target.files)} />
      <button type="button" className="button button-primary" onClick={() => input.current?.click()}><Upload size={16} /> Choose files</button>
    </div>
    {error && <p className="photo-error" role="alert">{error}</p>}
    <p className="photo-help">Images get an oriented, metadata-free WebP preview and thumbnail. Nothing reaches the public CDN until you publish. Video metadata and capture dates can be entered manually after import.</p>
    {rows.length > 0 && <>
      <div className="photo-actions"><strong>{rows.length} in queue <span className="photo-muted">· {completed.length} saved as drafts</span></strong>
        {busy ? <button type="button" className="media-button" onClick={() => controller.current?.abort()}>Pause imports</button> : <button type="button" className="button button-primary" disabled={!pendingCount} onClick={() => void run()}><Upload size={16} /> Import {pendingCount || "queued"} {pendingCount === 1 ? "item" : "items"}</button>}
        {completed.length > 0 && <button className="media-button" type="button" onClick={() => setEditorId(completed[0].id)}>Edit imported items</button>}
      </div>
      <div className="photo-import-queue">
        {rows.map((row) => <div key={row.id} className={`photo-import-row ${selected === row.id ? "selected" : ""}`}>
          <button type="button" className="photo-import-preview" onClick={() => setSelected(row.id)} aria-label={`Preview ${row.file.name}`} aria-pressed={selected === row.id}>{row.preview ? <img src={row.preview} alt="" loading="lazy" decoding="async" /> : row.kind === "video" ? <Film size={24} /> : <ImagePlus size={24} />}</button>
          <div className="photo-import-info"><strong>{row.file.name}</strong><span className="photo-muted">{formatBytes(row.file.size)} · {row.kind === "photo" ? "Photograph" : "Video"}</span>
            {row.kind === "video" && !row.item && <div className="photo-import-video-options">
              <label>Web-ready video <input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={(event) => update(row.id, { webVideo: event.target.files?.[0], prepared: undefined, useOriginalVideo: false })} /></label>
              {row.webVideo && <span className="photo-muted">{row.webVideo.name}</span>}
              <label><input type="checkbox" checked={row.useOriginalVideo} disabled={busy} onChange={(event) => update(row.id, { useOriginalVideo: event.target.checked, prepared: undefined })} /> Use this original as the web variant: I have optimised it and reviewed embedded location metadata.</label>
            </div>}
            {row.error && <p className="photo-error" role="alert">{row.error}</p>}
            {row.state === "uploading" && <progress className="photo-import-progress" max={100} value={row.progress} aria-label={`${row.file.name} upload progress`} />}
          </div>
          <span className="photo-import-status" role="status">{["preparing", "uploading", "verifying"].includes(row.state) && <LoaderCircle size={14} className="photo-spin" />}{row.state === "ready" && <Check size={14} />}{row.state === "ready" ? "Draft saved" : row.state === "uploading" ? `${row.progress}%` : row.state === "verifying" ? "Verifying" : row.state === "preparing" ? "Preparing" : row.state === "failed" ? "Needs attention" : "Queued"}</span>
          <div className="photo-import-actions">{row.item && <button className="media-button" type="button" onClick={() => setEditorId(row.item!.id)}>Edit</button>}{row.state === "failed" && <button type="button" className="media-button" disabled={busy} onClick={() => void run([row.id])}><RefreshCw size={13} /> {row.completionPending ? "Verify again" : "Retry"}</button>}<button type="button" className="icon-button" disabled={busy} aria-label={`Remove ${row.file.name} from queue`} title={row.item ? "Remove from queue; the imported draft is kept" : "Remove from queue and clean up partial upload"} onClick={() => void remove(row)}><X size={16} /></button></div>
        </div>)}
      </div>
      {current?.preview && <div className="photo-import-selected"><div className="photo-import-large-preview"><img src={current.preview} alt={current.prepared?.metadata.alt_text || current.file.name} /></div><h3>{current.prepared?.metadata.title || current.file.name}</h3><p className="photo-muted">{cameraSummary(current.prepared?.metadata || {}) || "No camera metadata found. You can add it in the editor after import."}</p></div>}
    </>}
    {editorId && completed.length > 0 && <PhotographyEditor items={completed} initialId={editorId} onClose={() => setEditorId(undefined)} onSaved={(item) => { const row = rowsRef.current.find((candidate) => candidate.item?.id === item.id); if (row) update(row.id, { item }); }} />}
  </div>;
}
