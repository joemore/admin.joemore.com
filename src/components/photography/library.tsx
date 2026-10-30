"use client";

/* eslint-disable @next/next/no-img-element -- Grid images are small pre-generated thumbnails delivered directly through short-lived private R2 signatures. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, CloudUpload, Grid2X2, ImageIcon, List, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { mediaRequest } from "@/components/media/client";
import type { PhotographyCatalog, PhotographyList, PhotographyMetadata, PhotographyView } from "@/lib/photography/types";
import { PhotographyEditor } from "./editor";
import { TagSelect } from "./tag-select";

export function PhotographyNav({ current }: { current: "library" | "upload" | "albums" }) {
  return <nav className="photo-navigation" aria-label="Photography navigation"><Link href="/photography" className={current === "library" ? "active" : ""} aria-current={current === "library" ? "page" : undefined}>Library</Link><Link href="/photography/upload" className={current === "upload" ? "active" : ""} aria-current={current === "upload" ? "page" : undefined}>Import</Link><Link href="/photography/albums" className={current === "albums" ? "active" : ""} aria-current={current === "albums" ? "page" : undefined}>Albums</Link></nav>;
}
export function PhotographyThumbnail({ item }: { item: PhotographyView }) {
  return <div className="photo-thumbnail">{item.thumbnail_url ? <img src={item.thumbnail_url} alt="" loading="lazy" /> : <ImageIcon size={28} strokeWidth={1.2} />}<span className="photo-type-mark">{item.media_type === "video" ? "VIDEO" : "PHOTO"}</span>{item.featured && <span className="photo-featured-mark">Featured</span>}</div>;
}
function captureLabel(item: PhotographyView) { const value = item.capture_local || item.date_taken; return value ? value.slice(0, 10) : "Capture date unknown"; }
export function PhotographyLibrary() {
  const [filters, setFilters] = useState({ q: "", tag: "", album: "", camera: "", year: "", type: "", status: "", sort: "date_taken" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [advanced, setAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PhotographyList | null>(null);
  const [catalog, setCatalog] = useState<PhotographyCatalog>({ tags: [], albums: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [bulkAlbums, setBulkAlbums] = useState<string[]>([]);
  const [bulkLocation, setBulkLocation] = useState("");
  const [bulkCountry, setBulkCountry] = useState("");
  const [bulkFeatured, setBulkFeatured] = useState("");
  const [bulkVisibility, setBulkVisibility] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void mediaRequest<PhotographyCatalog>("/api/photography/catalog", { signal: controller.signal }).then(setCatalog).catch(() => {});
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ ...filters, year: /^\d{4}$/.test(filters.year) ? filters.year : "", page: String(page), pageSize: "36" });
      void mediaRequest<PhotographyList>(`/api/photography?${query}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setData(result); const last = Math.max(1, Math.ceil(result.count / result.pageSize)); if (page > last) setPage(last); } }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The photography library could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, filters.q || filters.camera ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, page, refresh]);
  function filter(key: keyof typeof filters, value: string) { setFilters((values) => ({ ...values, [key]: value })); setPage(1); setSelected([]); }
  function toggle(id: string) { setSelected((ids) => ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]); }
  async function bulkSave() {
    setBusy(true); setError(""); setNotice("");
    const metadata: Partial<PhotographyMetadata> = {};
    if (bulkLocation.trim()) metadata.location_name = bulkLocation.trim();
    if (bulkCountry.trim()) metadata.country = bulkCountry.trim();
    if (bulkFeatured) metadata.featured = bulkFeatured === "yes";
    if (bulkVisibility) metadata.location_visibility = bulkVisibility as PhotographyMetadata["location_visibility"];
    try {
      await mediaRequest("/api/photography/bulk", { method: "POST", body: JSON.stringify({ ids: selected, ...(Object.keys(metadata).length ? { metadata } : {}), ...(bulkTags.length ? { tag_ids: bulkTags } : {}), ...(bulkAlbums.length ? { album_ids: bulkAlbums } : {}) }) });
      setNotice(`Updated ${selected.length} selected items.`); setBulkOpen(false); setSelected([]); setBulkTags([]); setBulkAlbums([]); setBulkLocation(""); setBulkCountry(""); setBulkFeatured(""); setBulkVisibility(""); setRefresh((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bulk changes could not be saved."); }
    finally { setBusy(false); }
  }
  async function cleanup() {
    setBusy(true); setError(""); setNotice("");
    try { const result = await mediaRequest<{ cleaned: number; failed: number }>("/api/photography/cleanup", { method: "POST", body: "{}" }); setNotice(`${result.cleaned} abandoned upload sessions cleaned.${result.failed ? ` ${result.failed} need another cleanup attempt.` : ""}`); setRefresh((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Cleanup could not be completed."); }
    finally { setBusy(false); }
  }
  const items = data?.items || [];
  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / (data?.pageSize || 36)));
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "sort" && value);
  return <div className="photo-workspace"><div className="page-heading"><div><span className="eyebrow">A LIFE THROUGH THE LENS</span><h1>Photography<span className="accent-text">.</span></h1><p>Collect your moments. Shape their stories. Share when you’re ready.</p></div><div className="photo-actions"><span className="photo-workspace-mark"><Camera size={16} />Your private collection</span><Link className="button button-primary" href="/photography/upload"><Plus size={16} />Import photography</Link></div></div><PhotographyNav current="library" />
    {error && <div className="media-error" role="alert"><div><strong>Photography needs your attention.</strong><p>{error}</p></div><button type="button" className="media-button" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} />Retry</button></div>}{notice && <p className="photo-notice" role="status">{notice}</p>}
    <section className="photo-library panel"><div className="photo-library-toolbar"><label className="photo-search"><Search size={17} /><input type="search" placeholder="Search titles, captions and places…" aria-label="Search photography" maxLength={100} value={filters.q} onChange={(event) => filter("q", event.target.value)} /></label><select aria-label="Filter by album" value={filters.album} onChange={(event) => filter("album", event.target.value)}><option value="">All albums</option>{catalog.albums.map((album) => <option value={album.id} key={album.id}>{album.title}</option>)}</select><select aria-label="Filter by status" value={filters.status} onChange={(event) => filter("status", event.target.value)}><option value="">Any status</option><option value="draft">Draft</option><option value="published">Published</option></select><button type="button" className={`media-button ${advanced ? "active" : ""}`} aria-expanded={advanced} aria-controls="photo-extra-filters" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={14} />Filters{hasFilters && <span className="photo-dirty-dot" />}</button><div className="media-view-toggle"><button type="button" className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")}><Grid2X2 size={16} /></button><button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")}><List size={17} /></button></div></div>
      {advanced && <div className="photo-extra-filters" id="photo-extra-filters"><label className="photo-field">Tag<select value={filters.tag} onChange={(event) => filter("tag", event.target.value)}><option value="">All tags</option>{catalog.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label className="photo-field">Camera<input placeholder="Make or model" value={filters.camera} maxLength={100} onChange={(event) => filter("camera", event.target.value)} /></label><label className="photo-field">Capture year<input type="number" placeholder="Any year" min={1800} max={9999} value={filters.year} onChange={(event) => filter("year", event.target.value)} /></label><label className="photo-field">Media type<select value={filters.type} onChange={(event) => filter("type", event.target.value)}><option value="">Photos & videos</option><option value="photo">Photos</option><option value="video">Videos</option></select></label><button type="button" className="photo-text-button" onClick={() => { setFilters({ q: "", tag: "", album: "", camera: "", year: "", type: "", status: "", sort: filters.sort }); setPage(1); }}>Clear filters</button></div>}
      <div className="photo-results-bar"><label className="photo-checkbox"><input type="checkbox" checked={Boolean(items.length && items.every((item) => selected.includes(item.id)))} disabled={!items.length} onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])} /><span>{selected.length ? `${selected.length} selected` : `${(data?.count || 0).toLocaleString()} items${hasFilters ? " matching filters" : " in your collection"}`}</span></label><div className="photo-actions">{selected.length > 0 && <button type="button" className="media-button" onClick={() => setBulkOpen(!bulkOpen)}>Edit selected</button>}<label className="photo-sort">Sort<select aria-label="Sort photography" value={filters.sort} onChange={(event) => filter("sort", event.target.value)}><option value="date_taken">Date taken</option><option value="newest">Newest added</option><option value="oldest">Oldest added</option><option value="title">Title A–Z</option></select></label><button type="button" className="icon-button" aria-label="Refresh photography" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} /></button></div></div>
      {bulkOpen && selected.length > 0 && <div className="photo-bulk-panel"><div className="photo-bulk-heading"><div><h3>Edit {selected.length} photographs</h3><p>Only filled fields change. Tags and albums are added to existing assignments.</p></div><button type="button" className="icon-button" aria-label="Close bulk editor" onClick={() => setBulkOpen(false)}><X size={16} /></button></div><div className="photo-field-grid"><label className="photo-field">Location name<input value={bulkLocation} maxLength={200} placeholder="Keep existing" onChange={(event) => setBulkLocation(event.target.value)} /></label><label className="photo-field">Country<input value={bulkCountry} maxLength={100} placeholder="Keep existing" onChange={(event) => setBulkCountry(event.target.value)} /></label><label className="photo-field">Featured<select value={bulkFeatured} onChange={(event) => setBulkFeatured(event.target.value)}><option value="">Keep existing</option><option value="yes">Featured</option><option value="no">Not featured</option></select></label><label className="photo-field">Location visibility<select value={bulkVisibility} onChange={(event) => setBulkVisibility(event.target.value)}><option value="">Keep existing</option><option value="hidden">Hidden</option><option value="approximate">Approximate</option><option value="exact">Exact</option></select></label></div><div className="photo-bulk-columns"><div><label className="photo-field">Add tags</label><TagSelect tags={catalog.tags} selected={bulkTags} onChange={setBulkTags} onTagsChanged={(tags) => setCatalog({ ...catalog, tags })} /></div><fieldset className="photo-album-options"><legend>Add to albums</legend>{catalog.albums.map((album) => <label className="photo-checkbox" key={album.id}><input type="checkbox" checked={bulkAlbums.includes(album.id)} onChange={(event) => setBulkAlbums(event.target.checked ? [...bulkAlbums, album.id] : bulkAlbums.filter((id) => id !== album.id))} />{album.title}</label>)}{!catalog.albums.length && <p className="photo-help">No albums created yet.</p>}</fieldset></div><button type="button" className="button button-primary" disabled={busy || !(bulkTags.length || bulkAlbums.length || bulkLocation.trim() || bulkCountry.trim() || bulkFeatured || bulkVisibility)} onClick={() => void bulkSave()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Apply to selected</button></div>}
      <div className={loading && data ? "photo-loading-results" : ""} aria-busy={loading}>
      {view === "grid" && items.length > 0 && <div className="photo-grid">{items.map((item) => <article className={`photo-card ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}><div className="photo-card-image"><button className="photo-preview-button" type="button" aria-label={`Edit ${item.title || item.original_filename}`} onClick={() => setEditor(item.id)}><PhotographyThumbnail item={item} /></button><label className="photo-card-select"><input type="checkbox" aria-label={`Select ${item.title || item.original_filename}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></label><span className={`photo-state ${item.status}`}>{item.status}</span></div><div className="photo-card-copy"><button type="button" onClick={() => setEditor(item.id)} title={item.title || item.original_filename}>{item.title || item.original_filename}</button><p>{item.location_name || item.camera_model || "Add details to tell its story"}</p><div className="photo-card-meta"><span>{captureLabel(item)}</span><span>{item.tags.length ? `${item.tags.length} tag${item.tags.length === 1 ? "" : "s"}` : item.storage_status !== "ready" ? item.storage_status : ""}</span></div></div></article>)}</div>}
      {view === "list" && items.length > 0 && <div className="media-table-scroll"><table className="media-table photo-table"><thead><tr><th>Select</th><th>Photograph</th><th>Capture date</th><th>Camera</th><th>Location</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`Select ${item.title || item.original_filename}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td><button type="button" className="media-file-name" onClick={() => setEditor(item.id)}><PhotographyThumbnail item={item} /><span><strong>{item.title || item.original_filename}</strong><small>{item.media_type}</small></span></button></td><td>{captureLabel(item)}</td><td>{[item.camera_make, item.camera_model].filter(Boolean).join(" ") || "—"}</td><td>{item.location_name || "—"}</td><td><span className={`photo-state ${item.status}`}>{item.status}</span></td></tr>)}</tbody></table></div>}
      {!items.length && !loading && <div className="photo-empty"><span className="photo-empty-icon"><Camera size={40} strokeWidth={1.1} /></span><span className="eyebrow">{hasFilters ? "REFINE YOUR VIEW" : "EVERY FRAME HAS A STORY"}</span><h2>{hasFilters ? "No photographs found." : "Your collection starts here."}</h2><p>{hasFilters ? "Try another search, tag or album to find your photographs." : "Import photographs and timelapse videos. Capture details come along; the story is yours to add."}</p>{hasFilters ? <button type="button" className="media-button" onClick={() => { setFilters({ q: "", tag: "", album: "", camera: "", year: "", type: "", status: "", sort: "date_taken" }); setPage(1); }}>Clear filters</button> : <Link className="button button-primary" href="/photography/upload"><CloudUpload size={15} />Import your first photographs</Link>}</div>}
      {loading && !data && <div className="media-loading" role="status"><LoaderCircle className="spin" size={22} />Opening your collection…</div>}
      </div><div className="media-pagination"><span>Page {page} of {totalPages}</span><div className="photo-actions"><button type="button" className="media-button" disabled={loading || page <= 1} onClick={() => { setPage(page - 1); setSelected([]); }}><ArrowLeft size={14} />Previous</button><button type="button" className="media-button" disabled={loading || page >= totalPages} onClick={() => { setPage(page + 1); setSelected([]); }}>Next<ArrowRight size={14} /></button></div></div></section>
    <div className="photo-maintenance"><p><ShieldCheck size={14} />Private originals. Drafts stay private until you publish.</p><button type="button" className="photo-text-button" disabled={busy} onClick={() => void cleanup()}><RefreshCw size={12} />Clean up abandoned uploads</button></div>
    {editor && <PhotographyEditor items={items} initialId={editor} onClose={() => { setEditor(null); setRefresh((value) => value + 1); }} onSaved={(item) => setData((value) => value ? { ...value, items: value.items.map((entry) => entry.id === item.id ? item : entry) } : value)} />}
  </div>;
}
