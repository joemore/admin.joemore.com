"use client";

import { useId, useState } from "react";
import { Check, Plus, Search, Tag, X } from "lucide-react";
import { mediaRequest } from "@/components/media/client";
import type { PhotographyTag } from "@/lib/photography/types";

export function TagSelect({ tags, selected, onChange, onTagsChanged }: { tags: PhotographyTag[]; selected: string[]; onChange: (ids: string[]) => void; onTagsChanged: (tags: PhotographyTag[]) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [name, setName] = useState("");
  const matches = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  async function create() {
    setBusy(true); setError("");
    try {
      const { tag } = await mediaRequest<{ tag: PhotographyTag }>("/api/photography/tags", { method: "POST", body: JSON.stringify({ name: query.trim() }) });
      onTagsChanged([...tags.filter((entry) => entry.id !== tag.id), tag].sort((a, b) => a.name.localeCompare(b.name)));
      onChange([...new Set([...selected, tag.id])]); setQuery("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the tag."); }
    finally { setBusy(false); }
  }
  async function saveRename() {
    if (!rename) return;
    setBusy(true); setError("");
    try {
      const { tag } = await mediaRequest<{ tag: PhotographyTag }>(`/api/photography/tags/${rename}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      onTagsChanged(tags.map((entry) => entry.id === tag.id ? tag : entry).sort((a, b) => a.name.localeCompare(b.name))); setRename(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not rename the tag."); }
    finally { setBusy(false); }
  }
  return <div className="photo-tag-select">
    <div className="photo-chips">{selected.map((tagId) => <span className="photo-chip" key={tagId}><Tag size={11} />{tags.find((tag) => tag.id === tagId)?.name || "Tag"}<button type="button" aria-label={`Remove ${tags.find((tag) => tag.id === tagId)?.name || "tag"}`} onClick={() => onChange(selected.filter((entry) => entry !== tagId))}><X size={12} /></button></span>)}</div>
    <button type="button" className="photo-select-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Plus size={13} />{selected.length ? "Add or manage tags" : "Choose tags"}</button>
    {open && <div className="photo-tag-dropdown" id={id}><label className="photo-tag-search"><Search size={14} /><input autoFocus aria-label="Search tags" placeholder="Search or create a tag…" maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="photo-tag-options">{matches.map((tag) => <div className="photo-tag-option" key={tag.id}><button type="button" aria-pressed={selected.includes(tag.id)} onClick={() => onChange(selected.includes(tag.id) ? selected.filter((entry) => entry !== tag.id) : [...selected, tag.id])}><span className={`photo-check ${selected.includes(tag.id) ? "checked" : ""}`}>{selected.includes(tag.id) && <Check size={11} />}</span>{tag.name}</button><button className="photo-text-button" type="button" onClick={() => { setRename(tag.id); setName(tag.name); }}>Rename</button></div>)}</div>{query.trim() && !tags.some((tag) => tag.name.toLowerCase() === query.trim().toLowerCase()) && <button className="photo-create-tag" type="button" disabled={busy} onClick={() => void create()}><Plus size={13} />Create “{query.trim()}”</button>}{!matches.length && !query && <p className="photo-muted">No tags yet. Type to create your first.</p>}{rename && <div className="photo-tag-rename"><label>Rename tag<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><button type="button" className="media-button" disabled={busy || !name.trim()} onClick={() => void saveRename()}>Save name</button><button type="button" className="photo-text-button" onClick={() => setRename(null)}>Cancel</button></div>}<button className="photo-text-button" type="button" onClick={() => setOpen(false)}>Done</button>{error && <p className="photo-error" role="alert">{error}</p>}</div>}
  </div>;
}
