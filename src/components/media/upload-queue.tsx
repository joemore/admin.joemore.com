"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CloudUpload, Copy, LoaderCircle, RotateCcw, X } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { formatBytes, mediaRequest, MediaRequestError, prepareThumbnail, uploadBytes, type SignedUpload } from "./client";

type UploadedAsset = { id: string; public_url: string; display_name: string };
type UploadPlan = { asset: UploadedAsset; mode: "single" | "multipart"; upload?: SignedUpload; thumbnail?: SignedUpload; partSize: number };
type QueueItem = {
  id: string; file: File; displayName: string; description: string;
  state: "queued" | "uploading" | "verifying" | "ready" | "failed" | "cancelled";
  progress: number; error?: string; asset?: UploadedAsset; hasSession?: boolean; originalDone?: boolean;
};
type Session = { plan: UploadPlan; nextPart: number; originalDone: boolean; thumbnail?: Blob; thumbnailDone: boolean };

const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg,.pdf,.txt,.zip";
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", pdf: "application/pdf", txt: "text/plain", zip: "application/zip" };

export function UploadQueue({ maxFileSize, onUploaded }: { maxFileSize: number; onUploaded: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const activeId = useRef<string | null>(null);
  const sessions = useRef(new Map<string, Session>());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function update(id: string, change: Partial<QueueItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));
  }

  function addFiles(files: FileList | File[]) {
    const added = Array.from(files).map((file): QueueItem => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const error = !MIME[extension] ? "This file type is not supported. HTML, SVG and scripts are not allowed."
        : file.size === 0 ? "Empty files cannot be uploaded."
          : file.size > maxFileSize ? `This file exceeds the ${formatBytes(maxFileSize)} limit.` : undefined;
      return { id: crypto.randomUUID(), file, displayName: file.name.replace(/\.[^.]+$/, "").slice(0, 160), description: "", state: error ? "failed" : "queued", progress: 0, error };
    });
    setItems((current) => [...current, ...added]);
    setNotice("");
  }

  async function retryTransfer(permission: SignedUpload, bytes: Blob, onProgress: (loaded: number) => void, signal: AbortSignal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await uploadBytes(permission, bytes, onProgress, signal); return; }
      catch (error) {
        // An uncertain PUT may already have succeeded; finalisation verifies its ownership and metadata.
        if (error instanceof MediaRequestError && error.status === 412) return;
        if (signal.aborted || attempt === 2 || (error instanceof MediaRequestError && error.status >= 400 && error.status < 500)) throw error;
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }

  async function processItems(selected: QueueItem[]) {
    if (running.current || !selected.length) return;
    running.current = true;
    setBusy(true);
    for (const item of selected) {
      if (!mounted.current) break;
      const abort = new AbortController();
      controller.current = abort;
      activeId.current = item.id;
      update(item.id, { state: "uploading", error: undefined });
      try {
        let session = sessions.current.get(item.id);
        if (!session) {
          const preview = await prepareThumbnail(item.file);
          const extension = item.file.name.split(".").pop()?.toLowerCase() ?? "";
          const plan = await mediaRequest<UploadPlan>("/api/media/uploads", {
            method: "POST", signal: abort.signal,
            body: JSON.stringify({ filename: item.file.name, mimeType: item.file.type || MIME[extension], sizeBytes: item.file.size, displayName: item.displayName || undefined, description: item.description || undefined, width: preview.width, height: preview.height, thumbnailSizeBytes: preview.blob?.size }),
          });
          session = { plan, nextPart: 1, originalDone: false, thumbnail: preview.blob, thumbnailDone: false };
          sessions.current.set(item.id, session);
          update(item.id, { hasSession: true });
        }
        const { plan } = session;
        // Small thumbnails go first so their initial permission cannot expire
        // while a slower original transfer is still in progress.
        if (session.thumbnail && plan.thumbnail && !session.thumbnailDone) {
          await retryTransfer(plan.thumbnail, session.thumbnail, () => {}, abort.signal);
          session.thumbnailDone = true;
        }
        if (!session.originalDone) {
          if (plan.mode === "single") {
            if (!plan.upload) throw new Error("Upload permission is unavailable. Restart this upload.");
            await retryTransfer(plan.upload, item.file, (loaded) => update(item.id, { progress: Math.min(95, Math.round(loaded / item.file.size * 95)) }), abort.signal);
          } else {
            const count = Math.ceil(item.file.size / plan.partSize);
            for (let part = session.nextPart; part <= count; part++) {
              const permission = await mediaRequest<SignedUpload>(`/api/media/uploads/${plan.asset.id}/parts`, { method: "POST", signal: abort.signal, body: JSON.stringify({ partNumber: part }) });
              const offset = (part - 1) * plan.partSize;
              await retryTransfer(permission, item.file.slice(offset, Math.min(item.file.size, offset + plan.partSize)), (loaded) => update(item.id, { progress: Math.min(95, Math.round((offset + loaded) / item.file.size * 95)) }), abort.signal);
              session.nextPart = part + 1;
            }
          }
          session.originalDone = true;
          update(item.id, { originalDone: true });
        }
        update(item.id, { state: "verifying", progress: 98 });
        const result = await mediaRequest<{ asset: UploadedAsset }>(`/api/media/uploads/${plan.asset.id}/complete`, { method: "POST", signal: abort.signal, body: "{}" });
        update(item.id, { state: "ready", progress: 100, asset: result.asset });
        sessions.current.delete(item.id);
        update(item.id, { hasSession: false });
        onUploaded();
      } catch (error) {
        update(item.id, { state: abort.signal.aborted ? "cancelled" : "failed", error: abort.signal.aborted ? "Upload cancelled. You can retry with a new session." : error instanceof Error ? error.message : "The upload failed. Please retry." });
      }
    }
    controller.current = null;
    activeId.current = null;
    running.current = false;
    setBusy(false);
  }

  async function cancel(item: QueueItem) {
    if (activeId.current === item.id) controller.current?.abort();
    const session = sessions.current.get(item.id);
    if (session) {
      try {
        await mediaRequest(`/api/media/uploads/${session.plan.asset.id}/abort`, { method: "POST", body: "{}" });
        sessions.current.delete(item.id);
        update(item.id, { hasSession: false, originalDone: false });
      } catch {
        setNotice("The upload stopped, but server cleanup could not be confirmed. Use Clean up stale uploads after the session expires.");
      }
    }
    update(item.id, { state: "cancelled", progress: 0, error: "Upload cancelled." });
  }

  async function restart(item: QueueItem) {
    await cancel(item);
    if (sessions.current.has(item.id)) return;
    await processItems([{ ...item, state: "queued", progress: 0 }]);
  }

  return (
    <section className="media-uploader panel" aria-label="Upload media">
      <div className={`media-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
        <span className="media-upload-icon"><CloudUpload size={25} strokeWidth={1.4} /></span>
        <div><h2>Make room for your next idea.</h2><p>Drop files here, or choose files to upload.</p></div>
        <button className="button button-primary" type="button" onClick={() => input.current?.click()}><CloudUpload size={16} />Choose files</button>
        <input className="sr-only" ref={input} type="file" multiple accept={ACCEPT} aria-label="Choose files to upload" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
        <p className="media-upload-formats">Images, video, audio, PDF, TXT and ZIP · Up to {formatBytes(maxFileSize)} each · Originals preserved</p>
      </div>
      {items.length > 0 && <div className="media-queue">
        <div className="media-queue-heading"><h3>Upload queue <span>{items.length}</span></h3><div className="media-actions"><button type="button" className="media-button" disabled={busy} onClick={() => setItems((current) => current.filter((item) => item.state !== "ready" && item.state !== "cancelled"))}>Clear completed</button><button type="button" className="button button-primary" disabled={busy || !items.some((item) => item.state === "queued")} onClick={() => void processItems(items.filter((item) => item.state === "queued"))}>{busy ? <LoaderCircle size={15} className="spin" /> : <CloudUpload size={15} />} {busy ? "Uploading…" : "Start uploads"}</button></div></div>
        {items.map((item) => <div className="media-queue-item" key={item.id}>
          <div className="media-queue-title"><strong title={item.file.name}>{item.file.name}</strong><span>{formatBytes(item.file.size)}</span><span className={`media-state state-${item.state}`}>{item.state === "ready" ? <Check size={13} /> : null}{item.state}</span></div>
          {(item.state === "queued" || (item.state === "failed" && !item.hasSession)) && <div className="media-upload-fields"><label>Display name<input value={item.displayName} maxLength={160} disabled={busy} onChange={(event) => update(item.id, { displayName: event.target.value })} /></label><label>Description <span>optional</span><input value={item.description} maxLength={2000} disabled={busy} onChange={(event) => update(item.id, { description: event.target.value })} /></label></div>}
          {(item.state === "uploading" || item.state === "verifying") && <progress max="100" value={item.progress} aria-label={`${item.file.name} upload progress`}>{item.progress}%</progress>}
          {item.error && <p className="media-inline-error">{item.error}</p>}
          <div className="media-queue-actions">
            {item.state === "ready" && item.asset && <><code>{item.asset.public_url}</code><CopyButton value={item.asset.public_url} label="Copy public CDN URL" /><Copy size={12} aria-hidden="true" className="media-copy-hint" /></>}
            {(item.state === "failed" || item.state === "cancelled") && <><button type="button" className="media-button" disabled={busy || item.file.size > maxFileSize || item.file.size === 0 || !MIME[item.file.name.split(".").pop()?.toLowerCase() ?? ""]} onClick={() => void processItems([item])}><RotateCcw size={13} />{item.originalDone ? "Verify again" : "Retry"}</button>{item.hasSession && <button type="button" className="media-button" disabled={busy} onClick={() => void restart(item)}>Restart upload</button>}</>}
            {(item.state === "queued" || item.state === "uploading") && <button type="button" className="media-button" disabled={busy && item.state === "queued"} onClick={() => item.state === "queued" ? setItems((current) => current.filter((entry) => entry.id !== item.id)) : void cancel(item)}><X size={13} />{item.state === "queued" ? "Remove" : "Cancel"}</button>}
          </div>
        </div>)}
      </div>}
      {notice && <p className="media-notice" role="status">{notice}</p>}
    </section>
  );
}
