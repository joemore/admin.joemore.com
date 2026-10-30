"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, FolderOpen, GripVertical, ImageIcon, LoaderCircle, Plus, Save, Search, Trash2, X } from "lucide-react";
import { mediaRequest } from "@/components/media/client";
import type { PhotographyAlbum, PhotographyCatalog, PhotographyList, PhotographyView } from "@/lib/photography/types";
import { PhotographyEditor } from "./editor";
import { PhotographyNav, PhotographyThumbnail } from "./library";

type AlbumForm = { title: string; slug: string; description: string; cover_item_id: string; display_order: string; status: "draft" | "published" };
const emptyAlbum: AlbumForm = { title: "", slug: "", description: "", cover_item_id: "", display_order: "0", status: "draft" };
function albumForm(album: PhotographyAlbum): AlbumForm { return { title: album.title, slug: album.slug, description: album.description || "", cover_item_id: album.cover_item_id || "", display_order: String(album.display_order), status: album.status }; }
export function PhotographyAlbums() {
  const [albums, setAlbums] = useState<PhotographyAlbum[]>([]);
  const [selected, setSelected] = useState<PhotographyAlbum | null>(null);
  const [form, setForm] = useState<AlbumForm>(emptyAlbum);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PhotographyView[]>([]);
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerPage, setPickerPage] = useState(1);
  const [choices, setChoices] = useState<PhotographyList | null>(null);
  const [picking, setPicking] = useState<string[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [albumItemsLoading, setAlbumItemsLoading] = useState(false);
  const dirtyOrder = JSON.stringify(items.map((item) => item.id)) !== JSON.stringify(savedOrder);
  const dirtyForm = editing && JSON.stringify(form) !== JSON.stringify(selected ? albumForm(selected) : emptyAlbum);
  const selectedId = selected?.id;
  useEffect(() => {
    const controller = new AbortController();
    void mediaRequest<PhotographyCatalog>("/api/photography/catalog", { signal: controller.signal }).then((catalog) => setAlbums(catalog.albums)).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Albums could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void mediaRequest<{ items: PhotographyView[] }>(`/api/photography/albums/${selectedId}/items`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setItems(result.items); setSavedOrder(result.items.map((item) => item.id)); } }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Album photographs could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setAlbumItemsLoading(false); });
    return () => controller.abort();
  }, [selectedId]);
  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPickerLoading(true);
      void mediaRequest<PhotographyList>(`/api/photography?${new URLSearchParams({ q: query, page: String(pickerPage), pageSize: "24", sort: "newest" })}`, { signal: controller.signal }).then(setChoices).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Photographs could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setPickerLoading(false); });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [picker, query, pickerPage]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyOrder || dirtyForm) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirtyOrder, dirtyForm]);
  useEffect(() => {
    const navigation = (event: MouseEvent) => {
      if (!(dirtyOrder || dirtyForm) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!window.confirm("Discard unsaved album changes and leave this page?")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", navigation, true);
    return () => document.removeEventListener("click", navigation, true);
  }, [dirtyOrder, dirtyForm]);
  function canSwitch() { return !(dirtyOrder || dirtyForm) || window.confirm("Discard unsaved album changes?"); }
  function select(album: PhotographyAlbum) {
    if (selected?.id === album.id || !canSwitch()) return;
    setAlbumItemsLoading(true); setSelected(album); setForm(albumForm(album)); setEditing(false); setCreating(false); setDeleteConfirm(false); setItems([]); setSavedOrder([]); setError(""); setNotice(""); setPicker(false);
  }
  async function saveAlbum() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await mediaRequest<{ album: PhotographyAlbum }>(creating ? "/api/photography/albums" : `/api/photography/albums/${selected!.id}`, { method: creating ? "POST" : "PATCH", body: JSON.stringify({ ...form, description: form.description || null, cover_item_id: form.cover_item_id || null, display_order: Number(form.display_order) }) });
      setAlbums((values) => [...values.filter((album) => album.id !== result.album.id), result.album].sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title)));
      setSelected(result.album); setForm(albumForm(result.album)); setCreating(false); setEditing(false); setNotice("Album saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Album could not be saved."); }
    finally { setBusy(false); }
  }
  async function removeAlbum() {
    if (!selected) return;
    setBusy(true); setError("");
    try { await mediaRequest(`/api/photography/albums/${selected.id}`, { method: "DELETE" }); setAlbums((values) => values.filter((album) => album.id !== selected.id)); setSelected(null); setItems([]); setSavedOrder([]); setEditing(false); setDeleteConfirm(false); setNotice("Album deleted. Its photographs remain in the library."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Album could not be deleted."); }
    finally { setBusy(false); }
  }
  async function saveOrder(next = items) {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await mediaRequest(`/api/photography/albums/${selected.id}/items`, { method: "PUT", body: JSON.stringify({ item_ids: next.map((item) => item.id) }) });
      setItems(next); setSavedOrder(next.map((item) => item.id));
      if (selected.cover_item_id && !next.some((item) => item.id === selected.cover_item_id)) {
        setSelected((album) => album?.id === selected.id ? { ...album, cover_item_id: null } : album);
        setAlbums((values) => values.map((album) => album.id === selected.id ? { ...album, cover_item_id: null } : album));
      }
      setForm((value) => value.cover_item_id && !next.some((item) => item.id === value.cover_item_id) ? { ...value, cover_item_id: "" } : value);
      setNotice("Album photographs and order saved.");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Album order could not be saved."); }
    finally { setBusy(false); }
  }
  function move(id: string, position: number) { setItems((values) => { const next = [...values]; const index = next.findIndex((item) => item.id === id); if (index < 0 || position < 0 || position >= next.length) return values; const [item] = next.splice(index, 1); next.splice(position, 0, item); return next; }); }
  async function addPicked() {
    if (!choices || !selected) return;
    const selectedChoices = choices.items.filter((item) => picking.includes(item.id) && !items.some((entry) => entry.id === item.id));
    const next = [...items, ...selectedChoices];
    setItems(next); setPicker(false); setPicking([]); await saveOrder(next);
  }
  return <div className="photo-workspace"><div className="page-heading"><div><span className="eyebrow">STORIES THAT BELONG TOGETHER</span><h1>Albums<span className="accent-text">.</span></h1><p>Organise photographs into collections. One photograph can tell many stories.</p></div><button type="button" className="button button-primary" onClick={() => { if (!canSwitch()) return; setCreating(true); setEditing(true); setSelected(null); setItems([]); setSavedOrder([]); setForm(emptyAlbum); setError(""); }}><Plus size={16} />Create album</button></div><PhotographyNav current="albums" />{error && <p role="alert" className="media-error">{error}</p>}{notice && <p role="status" className="photo-notice">{notice}</p>}
    <div className="photo-albums-layout"><aside className="photo-albums-list panel"><div className="photo-albums-list-heading"><span className="eyebrow">YOUR ALBUMS</span><span>{albums.length}</span></div>{loading && <div className="media-loading"><LoaderCircle size={18} className="spin" /></div>}{albums.map((album) => <button type="button" className={`photo-album-entry ${selected?.id === album.id ? "active" : ""}`} onClick={() => select(album)} key={album.id}><span className="photo-album-icon"><FolderOpen size={20} strokeWidth={1.4} /></span><span><strong>{album.title}</strong><small>/{album.slug}</small></span><span className={`photo-state ${album.status}`}>{album.status}</span></button>)}{!loading && !albums.length && <p className="photo-help photo-albums-no-items">Albums are collections, so your stored files never move. Create your first album to get started.</p>}</aside>
    <section className="photo-album-content panel">{!selected && !creating && <div className="photo-empty"><span className="photo-empty-icon"><FolderOpen size={38} strokeWidth={1.1} /></span><h2>A collection for every story.</h2><p>Choose an album to arrange its photographs, or create a new one.</p><button type="button" className="media-button" onClick={() => { setCreating(true); setEditing(true); setForm(emptyAlbum); }}><Plus size={14} />Create an album</button></div>}
      {editing && <form className="photo-album-form" onSubmit={(event) => { event.preventDefault(); void saveAlbum(); }}><div className="photo-bulk-heading"><h2>{creating ? "Create an album" : "Album details"}</h2><button type="button" className="icon-button" aria-label="Close album details" onClick={() => { if (!dirtyForm || window.confirm("Discard unsaved album details?")) { setEditing(false); setCreating(false); if (selected) setForm(albumForm(selected)); } }}><X size={17} /></button></div><div className="photo-field-grid"><label className="photo-field">Album title<input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="photo-field">Collection slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="a-week-in-patagonia" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label><label className="photo-field photo-field-wide">Description<textarea rows={3} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label className="photo-field">Display order<input type="number" step="1" required value={form.display_order} onChange={(event) => setForm({ ...form, display_order: event.target.value })} /></label><label className="photo-field">Album visibility<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AlbumForm["status"] })}><option value="draft">Draft</option><option value="published">Published</option></select></label><label className="photo-field photo-field-wide">Cover photograph<select value={form.cover_item_id} onChange={(event) => setForm({ ...form, cover_item_id: event.target.value })}><option value="">No cover selected</option>{items.map((item) => <option value={item.id} key={item.id}>{item.title || item.original_filename}</option>)}</select></label></div><p className="photo-help">Album publication sets its future gallery visibility. Photographs are published individually from their editor.</p><button type="submit" className="button button-primary" disabled={busy || !form.title.trim() || !form.slug.trim()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}Save album</button></form>}
      {selected && <><header className="photo-album-detail-heading"><div><span className="eyebrow">/{selected.slug}</span><h2>{selected.title}</h2>{selected.description && <p>{selected.description}</p>}</div><div className="photo-actions"><button type="button" className="media-button" disabled={busy} onClick={() => { if (editing && dirtyForm && !window.confirm("Discard unsaved album details?")) return; setEditing(!editing); setForm(albumForm(selected)); }}>Edit details</button><button type="button" className="icon-button" aria-label="Delete album" onClick={() => setDeleteConfirm(!deleteConfirm)}><Trash2 size={15} /></button></div></header>{deleteConfirm && <div className="photo-delete-warning"><p>Delete “{selected.title}”? All photographs stay in your library.</p><div className="photo-actions"><button type="button" className="media-button" disabled={busy} onClick={() => setDeleteConfirm(false)}>Keep album</button><button type="button" className="media-button media-danger" disabled={busy} onClick={() => void removeAlbum()}>Delete album</button></div></div>}
      <div className="photo-album-order-heading"><span>{items.length} photographs · Drag to arrange, or use the arrow buttons</span><div className="photo-actions">{dirtyOrder && <button type="button" className="media-button" disabled={busy} onClick={() => void saveOrder()}><Check size={14} />Save order & changes</button>}<button type="button" className="media-button" disabled={busy || albumItemsLoading} onClick={() => { setPicker(!picker); setPicking([]); }}><Plus size={14} />Add photographs</button></div></div>
      {picker && <div className="photo-album-picker"><div className="photo-bulk-heading"><label className="photo-search"><Search size={15} /><input type="search" placeholder="Search library…" aria-label="Search photographs to add" value={query} onChange={(event) => { setQuery(event.target.value); setPickerPage(1); setPicking([]); }} /></label><button type="button" className="icon-button" aria-label="Close photo picker" onClick={() => setPicker(false)}><X size={16} /></button></div>{pickerLoading && <p className="photo-help">Loading photographs…</p>}<div className="photo-picker-grid">{choices?.items.map((item) => { const exists = items.some((entry) => entry.id === item.id); return <label className={exists ? "disabled" : ""} key={item.id}><PhotographyThumbnail item={item} /><span><input type="checkbox" disabled={exists || busy} checked={exists || picking.includes(item.id)} onChange={(event) => setPicking(event.target.checked ? [...picking, item.id] : picking.filter((id) => id !== item.id))} />{item.title || item.original_filename}</span></label>; })}</div><div className="photo-picker-footer"><div className="photo-actions"><button type="button" className="media-button" disabled={pickerPage <= 1 || pickerLoading} onClick={() => { setPickerPage(pickerPage - 1); setPicking([]); }}>Previous</button><span className="photo-help">Page {pickerPage}</span><button type="button" className="media-button" disabled={pickerLoading || pickerPage * (choices?.pageSize || 24) >= (choices?.count || 0)} onClick={() => { setPickerPage(pickerPage + 1); setPicking([]); }}>Next</button></div><button type="button" className="button button-primary" disabled={busy || !picking.length} onClick={() => void addPicked()}>Add {picking.length || ""} selected</button></div></div>}
      {albumItemsLoading && <div className="media-loading" role="status"><LoaderCircle size={18} className="spin" />Loading album photographs…</div>}<div className="photo-album-order">{items.map((item, index) => <article className={`photo-order-row ${dragged === item.id ? "dragging" : ""}`} draggable={!busy} onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; setDragged(item.id); }} onDragEnd={() => setDragged(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragged) move(dragged, index); setDragged(null); }} key={item.id}><span className="photo-drag-handle" aria-hidden="true"><GripVertical size={17} /></span><span className="photo-order-number">{String(index + 1).padStart(2, "0")}</span><button className="photo-order-item" type="button" onClick={() => setEditor(item.id)}><PhotographyThumbnail item={item} /><span><strong>{item.title || item.original_filename}</strong><small>{item.location_name || item.media_type}{selected.cover_item_id === item.id ? " · Album cover" : ""}</small></span></button><div className="photo-actions"><button type="button" className="icon-button" disabled={busy || index === 0} aria-label={`Move ${item.title || item.original_filename} earlier`} onClick={() => move(item.id, index - 1)}><ArrowUp size={14} /></button><button type="button" className="icon-button" disabled={busy || index === items.length - 1} aria-label={`Move ${item.title || item.original_filename} later`} onClick={() => move(item.id, index + 1)}><ArrowDown size={14} /></button><button type="button" className="icon-button" disabled={busy} aria-label={`Remove ${item.title || item.original_filename} from album`} onClick={() => setItems(items.filter((entry) => entry.id !== item.id))}><X size={15} /></button></div></article>)}</div>{!items.length && !picker && !albumItemsLoading && <div className="photo-empty photo-album-empty"><ImageIcon size={35} strokeWidth={1.2} /><h3>Ready for its first photograph.</h3><p>Add photographs from your library to start this collection.</p><button type="button" className="media-button" onClick={() => setPicker(true)}><Plus size={13} />Add photographs</button></div>}{dirtyOrder && <div className="photo-album-save-footer"><p className="photo-dirty">Unsaved album changes</p><button type="button" className="button button-primary" disabled={busy} onClick={() => void saveOrder()}><Save size={14} />Save photographs & order</button></div>}</>}
    </section></div>{editor && <PhotographyEditor items={items} initialId={editor} onClose={() => setEditor(null)} onSaved={(item) => setItems((values) => values.map((entry) => entry.id === item.id ? item : entry))} />}
  </div>;
}
