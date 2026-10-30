"use client";

/* eslint-disable @next/next/no-img-element -- Derivatives are already optimised; private signed URLs must be fetched directly by the authorised browser. */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Copy, Download, Globe, ImageIcon, LoaderCircle, LockKeyhole, MapPin, Save, X } from "lucide-react";
import { mediaRequest } from "@/components/media/client";
import type { PhotographyCatalog, PhotographyMetadata, PhotographyView } from "@/lib/photography/types";
import { TagSelect } from "./tag-select";

const metadataKeys = ["title", "caption", "description", "alt_text", "date_taken", "capture_local", "capture_timezone", "camera_make", "camera_model", "lens_model", "aperture", "shutter_speed", "iso", "focal_length", "exposure_compensation", "camera_settings", "latitude", "longitude", "altitude", "location_name", "country", "region", "location_visibility", "featured", "allow_original_download", "display_order", "width", "height", "duration_ms", "orientation"] as const;
type Draft = { metadata: PhotographyMetadata; tag_ids: string[]; album_ids: string[]; gps_reviewed: boolean; settings: string };
function itemDraft(item: PhotographyView): Draft {
  const metadata = Object.fromEntries(metadataKeys.map((key) => [key, item[key]])) as PhotographyMetadata;
  return { metadata, tag_ids: item.tags.map((tag) => tag.id), album_ids: item.album_ids, gps_reviewed: item.original_gps_reviewed, settings: JSON.stringify(item.camera_settings, null, 2) };
}

export function PhotographyEditor({ items, initialId, onClose, onSaved }: { items: PhotographyView[]; initialId?: string; onClose: () => void; onSaved?: (item: PhotographyView) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(Math.max(0, items.findIndex((item) => item.id === initialId)));
  const [records, setRecords] = useState<Record<string, PhotographyView>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [catalog, setCatalog] = useState<PhotographyCatalog>({ tags: [], albums: [] });
  const [tab, setTab] = useState("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [closeWarning, setCloseWarning] = useState(false);
  const source = items[index];
  const item = source ? records[source.id] || source : undefined;
  const draft = item ? drafts[item.id] || itemDraft(item) : undefined;
  const dirty = Boolean(item && drafts[item.id] && JSON.stringify(drafts[item.id]) !== JSON.stringify(itemDraft(item)));
  const hasUnsaved = Object.entries(drafts).some(([id, value]) => { const row = records[id] || items.find((entry) => entry.id === id); return row && JSON.stringify(value) !== JSON.stringify(itemDraft(row)); });

  const requestClose = useCallback(() => { if (hasUnsaved) setCloseWarning(true); else onClose(); }, [hasUnsaved, onClose]);
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    void mediaRequest<PhotographyCatalog>("/api/photography/catalog", { signal: controller.signal }).then(setCatalog).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Tags and albums could not be loaded."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    void mediaRequest<{ item: PhotographyView }>(`/api/photography/${source.id}`, { signal: controller.signal }).then(({ item: fresh }) => {
      setRecords((values) => ({ ...values, [fresh.id]: values[fresh.id] ? { ...values[fresh.id], preview_url: fresh.preview_url, thumbnail_url: fresh.thumbnail_url, poster_url: fresh.poster_url } : fresh }));
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Preview links could not be refreshed."); });
    return () => controller.abort();
  }, [source]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsaved]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (busy || target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.max(0, Math.min(items.length - 1, value + (event.key === "ArrowRight" ? 1 : -1)))); setError(""); setNotice(""); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [busy, items.length]);

  function update(patch: Partial<Draft>) { if (item && draft) setDrafts((values) => ({ ...values, [item.id]: { ...draft, ...patch } })); }
  function metadata(patch: Partial<PhotographyMetadata>) { if (draft) update({ metadata: { ...draft.metadata, ...patch } }); }
  async function save() {
    if (!item || !draft) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const settings: unknown = JSON.parse(draft.settings);
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Additional camera settings must be a JSON object.");
      const result = await mediaRequest<{ item: PhotographyView }>(`/api/photography/${item.id}`, { method: "PATCH", body: JSON.stringify({ metadata: { ...draft.metadata, camera_settings: settings }, tag_ids: draft.tag_ids, album_ids: draft.album_ids, gps_reviewed: draft.gps_reviewed, expected_updated_at: item.updated_at }) });
      setRecords((values) => ({ ...values, [item.id]: result.item }));
      setDrafts((values) => ({ ...values, [item.id]: itemDraft(result.item) }));
      onSaved?.(result.item); setNotice("Changes saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save changes."); }
    finally { setBusy(false); }
  }
  async function publish(action?: "publish" | "unpublish") {
    if (!item) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await mediaRequest(`/api/photography/${item.id}/publish`, { method: "POST", body: JSON.stringify({ action: action || (item.status === "published" || item.storage_status === "unpublishing" ? "unpublish" : "publish") }) });
      const result = await mediaRequest<{ item: PhotographyView }>(`/api/photography/${item.id}`);
      setRecords((values) => ({ ...values, [item.id]: result.item })); setDrafts((values) => ({ ...values, [item.id]: itemDraft(result.item) })); onSaved?.(result.item);
      setNotice(result.item.status === "published" ? "Published derivatives are available on the CDN." : "Unpublished. CDN cache expiry may take time.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The publication could not be completed. Retry to recover.");
      try {
        const { item: latest } = await mediaRequest<{ item: PhotographyView }>(`/api/photography/${item.id}`);
        setRecords((values) => ({ ...values, [item.id]: latest })); setDrafts((values) => ({ ...values, [item.id]: itemDraft(latest) })); onSaved?.(latest);
      } catch { /* The original failure remains visible; recovery controls appear on the next successful refresh. */ }
    }
    finally { setBusy(false); }
  }
  async function download() {
    if (!item) return;
    setBusy(true); setError("");
    try { const result = await mediaRequest<{ url: string }>(`/api/photography/${item.id}/download`); window.location.assign(result.url); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Download is unavailable."); }
    finally { setBusy(false); }
  }
  if (!item || !draft) return null;
  const value = draft.metadata;
  function text(key: keyof PhotographyMetadata, label: string, options: { type?: string; placeholder?: string; step?: string; min?: number; max?: number; wide?: boolean } = {}) {
    const numeric = options.type === "number";
    return <label className={options.wide ? "photo-field photo-field-wide" : "photo-field"}>{label}<input type={options.type || "text"} value={value[key] === null ? "" : String(value[key])} placeholder={options.placeholder} step={options.step} min={options.min} max={options.max} maxLength={numeric ? undefined : ({ title: 160, camera_make: 160, camera_model: 160, lens_model: 200, shutter_speed: 80, location_name: 240, country: 100, region: 200, capture_timezone: 80 } as Partial<Record<keyof PhotographyMetadata, number>>)[key] || 500} onChange={(event) => metadata({ [key]: event.target.value === "" ? (key === "title" ? "" : null) : numeric ? Number(event.target.value) : event.target.value })} /></label>;
  }
  return <dialog ref={dialog} className="photo-editor" onCancel={(event) => { event.preventDefault(); if (!busy) requestClose(); }} aria-label="Photography editor">
    <header className="photo-editor-heading"><div><span className="eyebrow">PHOTOGRAPHY EDITOR · {index + 1} / {items.length}</span><h2>{item.title || item.original_filename}</h2></div><div className="photo-actions"><span className={`photo-state ${item.status}`}>{item.status}</span><button type="button" className="icon-button" disabled={busy} aria-label="Close editor" onClick={requestClose}><X size={19} /></button></div></header>
    {closeWarning && <div className="photo-unsaved" role="alert"><p>You have unsaved edits. Save each edited item before closing to keep them.</p><div className="photo-actions"><button type="button" className="media-button" onClick={() => setCloseWarning(false)}>Keep editing</button><button type="button" className="media-button media-danger" onClick={onClose}>Discard unsaved edits</button></div></div>}
    <div className="photo-editor-body"><section className="photo-editor-stage"><div className="photo-large-preview">{item.media_type === "video" && item.preview_url ? <video src={item.preview_url} poster={item.poster_url || item.thumbnail_url || undefined} controls preload="metadata" /> : item.preview_url ? <img src={item.preview_url} alt={value.alt_text || value.title || "Selected photograph"} /> : <div className="photo-preview-empty"><ImageIcon size={40} /><p>Preview available after upload completes.</p></div>}<span className="photo-private-label"><LockKeyhole size={11} />Admin preview</span></div><div className="photo-preview-caption"><span>{item.original_filename}</span><span>{value.width && value.height ? `${value.width} × ${value.height}` : "Dimensions unknown"}{value.duration_ms ? ` · ${(value.duration_ms / 1000).toFixed(1)}s` : ""}</span></div><div className="photo-filmstrip-nav"><button className="media-button" type="button" disabled={index === 0 || busy} onClick={() => { setIndex(index - 1); setError(""); setNotice(""); }}><ArrowLeft size={14} />Previous</button><span>← → to move · Edits stay with each item</span><button className="media-button" type="button" disabled={index === items.length - 1 || busy} onClick={() => { setIndex(index + 1); setError(""); setNotice(""); }}>Next<ArrowRight size={14} /></button></div><div className="photo-filmstrip" aria-label="Imported photographs">{items.map((entry, entryIndex) => <button type="button" disabled={busy} aria-label={`Edit ${entry.title || entry.original_filename}`} aria-current={entryIndex === index ? "true" : undefined} className={entryIndex === index ? "active" : ""} key={entry.id} onClick={() => { setIndex(entryIndex); setError(""); setNotice(""); }}>{entry.thumbnail_url ? <img src={entry.thumbnail_url} alt="" /> : <ImageIcon size={18} />}{drafts[entry.id] && JSON.stringify(drafts[entry.id]) !== JSON.stringify(itemDraft(records[entry.id] || entry)) && <span className="photo-dirty-dot" />}</button>)}</div></section>
    <section className="photo-editor-panel"><div className="photo-editor-tabs" role="tablist" aria-label="Metadata sections">{[["details", ImageIcon, "Details"], ["camera", Camera, "Camera"], ["location", MapPin, "Location"], ["publishing", Globe, "Publishing"]].map(([key, Icon, label]) => { const TabIcon = Icon as typeof ImageIcon; return <button type="button" role="tab" aria-selected={tab === key} aria-controls={`photo-tab-${key}`} id={`photo-editor-tab-${key}`} className={tab === key ? "active" : ""} key={String(key)} onClick={() => setTab(String(key))}><TabIcon size={14} />{String(label)}</button>; })}</div>
      <fieldset disabled={busy} className="photo-editor-fields" role="tabpanel" id={`photo-tab-${tab}`} aria-labelledby={`photo-editor-tab-${tab}`}>
      {tab === "details" && <><div className="photo-field-grid">{text("title", "Title", { wide: true })}<label className="photo-field photo-field-wide">Caption<textarea rows={3} value={value.caption || ""} maxLength={4000} onChange={(event) => metadata({ caption: event.target.value || null })} /></label><label className="photo-field photo-field-wide">Extended description<textarea rows={4} value={value.description || ""} maxLength={20000} onChange={(event) => metadata({ description: event.target.value || null })} /></label>{text("alt_text", "Alt text", { wide: true, placeholder: "Describe what is visible for screen readers" })}{text("date_taken", "Capture instant (with UTC offset)", { wide: true, placeholder: "2026-10-30T16:30:00-03:00" })}{text("capture_local", "Original local capture time", { type: "datetime-local", wide: true })}{text("capture_timezone", "Capture timezone", { wide: true, placeholder: "America/Sao_Paulo or +03:00" })}</div><p className="photo-help">A local capture time has no assumed timezone. Add an absolute capture instant only when the offset is known.</p><label className="photo-field">Tags</label><TagSelect tags={catalog.tags} selected={draft.tag_ids} onChange={(tag_ids) => update({ tag_ids })} onTagsChanged={(tags) => setCatalog({ ...catalog, tags })} /><fieldset className="photo-album-options"><legend>Albums</legend>{catalog.albums.length ? catalog.albums.map((album) => <label className="photo-checkbox" key={album.id}><input type="checkbox" checked={draft.album_ids.includes(album.id)} onChange={(event) => update({ album_ids: event.target.checked ? [...draft.album_ids, album.id] : draft.album_ids.filter((id) => id !== album.id) })} />{album.title}</label>) : <p className="photo-help">Create an album from Photography → Albums.</p>}</fieldset></>}
      {tab === "camera" && <><p className="photo-section-intro">Extracted when available. Every value can be corrected here.</p><div className="photo-field-grid">{text("camera_make", "Camera make", { placeholder: "Canon" })}{text("camera_model", "Camera model", { placeholder: "EOS R5" })}{text("lens_model", "Lens model", { wide: true })}{text("aperture", "Aperture · f/", { type: "number", min: 0.1, step: "any", placeholder: "2.8" })}{text("shutter_speed", "Shutter speed", { placeholder: "1/250s" })}{text("iso", "ISO", { type: "number", min: 1, step: "1" })}{text("focal_length", "Focal length · mm", { type: "number", min: 0.1, step: "any" })}{text("exposure_compensation", "Exposure compensation · EV", { type: "number", step: "any" })}{text("orientation", "EXIF orientation · 1–8", { type: "number", min: 1, max: 8, step: "1" })}{text("width", "Original width · px", { type: "number", min: 1, step: "1" })}{text("height", "Original height · px", { type: "number", min: 1, step: "1" })}{text("duration_ms", "Video duration · ms", { type: "number", min: 0, step: "1", wide: true })}<label className="photo-field photo-field-wide">Additional camera settings (JSON)<textarea className="photo-mono" rows={5} value={draft.settings} onChange={(event) => update({ settings: event.target.value })} /></label></div><p className="photo-help">Leave missing metadata blank. Derivatives use corrected image orientation.</p></>}
      {tab === "location" && <><p className="photo-section-intro">Precise coordinates remain private unless you explicitly choose exact public visibility.</p><div className="photo-field-grid">{text("location_name", "Place name", { wide: true })}{text("latitude", "Latitude", { type: "number", min: -90, max: 90, step: "any" })}{text("longitude", "Longitude", { type: "number", min: -180, max: 180, step: "any" })}{text("altitude", "Altitude · m", { type: "number", step: "any", wide: true })}{text("country", "Country")}{text("region", "Region / city")}<label className="photo-field photo-field-wide">Public location visibility<select value={value.location_visibility} onChange={(event) => metadata({ location_visibility: event.target.value as PhotographyMetadata["location_visibility"] })}><option value="hidden">Hidden · keep location private</option><option value="approximate">Approximate · rounded area</option><option value="exact">Exact · publish precise coordinates</option></select></label></div><p className="photo-help">Public image derivatives have embedded EXIF and GPS removed. Location fields will follow this setting in the future gallery.</p></>}
      {tab === "publishing" && <><div className="photo-publication-state"><span className={`photo-state ${item.status}`}>{item.status}</span><p>{item.status === "published" ? "The display media is available on the public CDN." : "Original and preview files are held in private storage."}</p></div><label className="photo-checkbox"><input type="checkbox" checked={value.featured} onChange={(event) => metadata({ featured: event.target.checked })} />Featured photograph</label>{text("display_order", "Public display order", { type: "number", step: "1" })}<div className="photo-gps-warning"><strong>{item.original_has_gps ? "Original contains GPS metadata" : "Review the original before enabling downloads"}</strong><p>{item.original_has_gps ? "Anyone downloading the original may read its embedded location, even when the public location is hidden." : "Original files may contain embedded locations or other private metadata. Video metadata may not be detected automatically."}</p><label className="photo-checkbox"><input type="checkbox" checked={draft.gps_reviewed} onChange={(event) => update({ gps_reviewed: event.target.checked, metadata: { ...value, allow_original_download: event.target.checked ? value.allow_original_download : false } })} />I have reviewed the original’s location metadata.</label></div><label className="photo-checkbox"><input type="checkbox" checked={value.allow_original_download} disabled={!draft.gps_reviewed} onChange={(event) => metadata({ allow_original_download: event.target.checked })} />Allow original downloads in the future public gallery</label><p className="photo-help">Originals require a server-authorised, short-lived download link. Public display images and videos can still be saved by visitors.</p><dl className="photo-info-list"><div><dt>Storage</dt><dd>{item.storage_status.replaceAll("_", " ")}</dd></div><div><dt>Published</dt><dd>{item.published_at ? new Date(item.published_at).toLocaleString() : "Not published"}</dd></div></dl>{item.public_url && <div className="photo-public-link"><label className="photo-field">Public media URL<input readOnly value={item.public_url} /></label><button type="button" className="media-button" onClick={() => void navigator.clipboard.writeText(item.public_url!).then(() => setNotice("Public media URL copied.")).catch(() => setError("Clipboard is unavailable. Select and copy the URL."))}><Copy size={13} />Copy URL</button><a className="media-button" href={item.public_url} target="_blank" rel="noopener noreferrer">Public preview</a></div>}<button type="button" className={`button ${item.status === "published" ? "button-secondary" : "button-primary"}`} disabled={busy || dirty || !["ready", "publishing", "unpublishing"].includes(item.storage_status)} onClick={() => void publish()}><Globe size={15} />{item.storage_status === "unpublishing" ? "Finish unpublishing" : item.storage_status === "publishing" ? "Retry publishing" : item.status === "published" ? "Unpublish media" : "Publish to CDN"}</button>{item.storage_status === "publishing" && <button type="button" className="media-button media-danger" disabled={busy || dirty} onClick={() => void publish("unpublish")}>Cancel partial publication</button>}{dirty && <p className="photo-help">Save your changes before publishing.</p>}<p className="photo-help">The public gallery website will be built separately. Unpublishing removes managed CDN derivatives; cached copies expire according to CDN settings.</p><button type="button" className="media-button" disabled={busy || item.storage_status !== "ready" || item.status !== "published" || !value.allow_original_download || !draft.gps_reviewed || dirty} onClick={() => void download()}><Download size={14} />Test enabled original download</button><p className="photo-help">The download test requires a published item with reviewed metadata and saved original download permission.</p></>}
      </fieldset><footer className="photo-editor-save">{error && <p className="photo-error" role="alert">{error}</p>}{notice && <p className="photo-success" role="status"><Check size={13} />{notice}</p>}<div className="photo-actions"><span className={dirty ? "photo-dirty" : "photo-muted"}>{dirty ? "Unsaved changes" : "All changes saved"}</span><button type="button" className="button button-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}Save changes</button></div></footer>
    </section></div>
  </dialog>;
}
