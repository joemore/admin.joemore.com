"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CloudUpload, Grid2X2, ImageIcon, Info, List, LoaderCircle, MoreHorizontal, RefreshCw, Search, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { AssetDetails, MediaThumbnail, type MediaItem } from "./asset-details";
import { formatBytes, formatDate, mediaRequest } from "./client";
import { LegacyBrowser } from "./legacy-browser";
import { UploadQueue } from "./upload-queue";

type LibraryResponse = { assets: MediaItem[]; total: number; page: number; pageSize: number; configured: boolean; missing?: string[]; maxFileSize: number };

export function MediaLibrary() {
  const [tab, setTab] = useState<"managed" | "legacy">("managed");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ search, type, sort, page: String(page) });
      void mediaRequest<LibraryResponse>(`/api/media?${query}`, { signal: controller.signal }).then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        const pages = Math.max(1, Math.ceil(response.total / (response.pageSize || 24)));
        if (page > pages) setPage(pages);
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The Media Library could not be loaded.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, type, sort, page, refresh]);

  function reload() { setRefresh((value) => value + 1); }

  async function cleanup() {
    setCleanupBusy(true); setNotice(""); setError("");
    try {
      const result = await mediaRequest<{ cleaned: number; failed: number }>("/api/media/cleanup", { method: "POST", body: "{}" });
      setNotice(`${result.cleaned} stale upload${result.cleaned === 1 ? "" : "s"} cleaned up.${result.failed ? ` ${result.failed} could not be cleaned up; retry when services recover.` : ""}`);
      reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Cleanup could not be completed."); }
    finally { setCleanupBusy(false); }
  }

  const assets = data?.assets ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize || 24)));
  function actions(asset: MediaItem) {
    return <details className="media-context"><summary className="icon-button" aria-label={`Actions for ${asset.display_name}`}><MoreHorizontal size={18} /></summary><div className="media-context-menu"><button type="button" onClick={() => setSelected(asset)}>View details</button>{asset.status === "ready" && <><a href={asset.public_url} target="_blank" rel="noopener noreferrer">Open public file<ArrowUpRight size={12} /></a><a href={`/api/media/${asset.id}/download`}>Download original</a><button type="button" onClick={() => setSelected(asset)}><Trash2 size={12} />Delete asset…</button></>}</div></details>;
  }

  return <div className="media-workspace">
    <div className="page-heading"><div><span className="eyebrow">YOUR CREATIVE COLLECTION</span><h1>Media library<span className="accent-text">.</span></h1><p>A permanent home for your files. Ready for wherever they go next.</p></div><div className="media-heading-actions"><Badge tone={data?.configured ? "success" : "neutral"} dot>{data?.configured ? "CDN configured" : "Media workspace"}</Badge><button className="button button-primary" type="button" disabled={!data?.configured} onClick={() => setUploaderOpen((value) => !value)}><CloudUpload size={16} />{uploaderOpen ? "Hide uploader" : "Upload files"}</button></div></div>
    <div className="media-tab-bar" role="tablist" aria-label="Media sources"><button id="managed-tab" type="button" role="tab" aria-selected={tab === "managed"} aria-controls="media-source-content" className={tab === "managed" ? "active" : ""} onClick={() => setTab("managed")}><ImageIcon size={16} />Media library{data?.configured && <span>{data.total.toLocaleString()}</span>}</button><button id="legacy-tab" type="button" role="tab" aria-selected={tab === "legacy"} aria-controls="media-source-content" className={tab === "legacy" ? "active" : ""} onClick={() => setTab("legacy")}><ShieldCheck size={16} />Existing R2 Files<span>Read only</span></button></div>
    {error && <div className="media-error" role="alert"><Info size={18} /><div><strong>We couldn’t complete that request.</strong><p>{error}</p></div><button type="button" className="media-button" onClick={reload}><RefreshCw size={14} />Try again</button></div>}
    {notice && <p className="media-notice" role="status">{notice}</p>}
    {!loading && data && !data.configured && <section className="media-setup panel"><span className="media-setup-icon"><Settings2 size={30} strokeWidth={1.4} /></span><div><span className="eyebrow">ONE-TIME SETUP</span><h2>Your media workspace is ready to connect.</h2><p>Add the server credentials and install the media database schema to start managing your CDN files. Existing bucket files stay untouched.</p>{data.missing?.length ? <p className="media-setup-missing">Required configuration: {data.missing.map((entry) => <code key={entry}>{entry}</code>)}</p> : null}<button type="button" className="media-button" onClick={reload}><RefreshCw size={14} />Check connection</button></div></section>}
    <div id="media-source-content" role="tabpanel" aria-labelledby={tab === "managed" ? "managed-tab" : "legacy-tab"}>
      {data?.configured && tab === "legacy" && <LegacyBrowser />}
      {/* Keep the queue mounted when switching sources so active uploads can finish. */}
      {data?.configured && <div hidden={!uploaderOpen}><UploadQueue maxFileSize={data.maxFileSize} onUploaded={reload} /></div>}
      {tab === "managed" && data?.configured && <>
        <section className="media-collection panel"><div className="media-toolbar"><label className="media-search"><Search size={16} /><input type="search" value={search} maxLength={100} placeholder="Search filenames and display names…" aria-label="Search managed media" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><div className="media-toolbar-controls"><select aria-label="Filter by file type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">All file types</option><option value="image">Images</option><option value="video">Video</option><option value="audio">Audio</option><option value="document">Documents</option></select><select aria-label="Sort managed media" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="size">Largest first</option></select><div className="media-view-toggle" aria-label="Media view"><button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-pressed={view === "grid"} aria-label="Gallery view"><Grid2X2 size={16} /></button><button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"} aria-label="List view"><List size={17} /></button></div></div></div>
          <div className="media-results-heading"><span>{data.total.toLocaleString()} {data.total === 1 ? "asset" : "assets"}{search || type !== "all" ? " matching your filters" : " in your library"}</span><button className="media-button" type="button" disabled={loading} onClick={reload}><RefreshCw size={13} />Refresh</button></div>
          <div aria-busy={loading} className={loading ? "media-results is-loading" : "media-results"}>
            {view === "grid" && assets.length > 0 && <div className="media-grid">{assets.map((asset) => <article className="media-card" key={asset.id}><button type="button" className="media-card-preview" aria-label={`View ${asset.display_name}`} onClick={() => setSelected(asset)}><MediaThumbnail asset={asset} /></button><div className="media-card-body"><div className="media-card-title"><button type="button" title={asset.display_name} onClick={() => setSelected(asset)}>{asset.display_name}</button>{actions(asset)}</div><p>{asset.media_type}<span>·</span>{formatBytes(asset.size_bytes)}</p><div className="media-card-footer"><time dateTime={asset.created_at}>{formatDate(asset.created_at)}</time>{asset.status === "ready" ? <CopyButton value={asset.public_url} label={`Copy URL for ${asset.display_name}`} /> : <Badge tone="warning">{asset.status.replaceAll("_", " ")}</Badge>}</div></div></article>)}</div>}
            {view === "list" && assets.length > 0 && <div className="media-table-scroll"><table className="media-table"><thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Date</th><th>Status</th><th className="media-align-right">Actions</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><td><button className="media-file-name" type="button" onClick={() => setSelected(asset)}><MediaThumbnail asset={asset} /><span title={asset.display_name}><strong>{asset.display_name}</strong><small>{asset.original_filename}</small></span></button></td><td>{asset.media_type}</td><td>{formatBytes(asset.size_bytes)}</td><td>{formatDate(asset.created_at)}</td><td><Badge tone={asset.status === "ready" ? "success" : "warning"}>{asset.status.replaceAll("_", " ")}</Badge></td><td className="media-align-right">{actions(asset)}</td></tr>)}</tbody></table></div>}
            {!assets.length && !loading && <div className="media-empty"><span className="media-empty-icon"><ImageIcon size={33} strokeWidth={1.25} /></span><h3>{search || type !== "all" ? "No matching assets." : "A fresh canvas for your files."}</h3><p>{search || type !== "all" ? "Try a different name or file type." : "Upload your first image, video, or file to start your collection."}</p>{search || type !== "all" ? <button className="media-button" type="button" onClick={() => { setSearch(""); setType("all"); setPage(1); }}>Clear filters</button> : <button type="button" className="button button-primary" onClick={() => setUploaderOpen(true)}><CloudUpload size={15} />Upload your first file</button>}</div>}
          </div>
          <div className="media-pagination"><span>Page {page} of {totalPages}</span><div className="media-actions"><button className="media-button" type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={14} />Previous</button><button className="media-button" type="button" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next<ArrowRight size={14} /></button></div></div>
        </section>
        <div className="media-maintenance"><p><ShieldCheck size={14} />Permanent URLs. Original quality. Only managed uploads can be deleted.</p><button type="button" className="media-button" disabled={cleanupBusy} onClick={() => void cleanup()} title="Clean expired, unfinished upload sessions. Ready assets and legacy objects are excluded.">{cleanupBusy ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}Clean up stale uploads</button></div>
      </>}
    </div>
    {loading && !data && <div className="media-loading" role="status"><LoaderCircle className="spin" size={22} />Loading your media workspace…</div>}
    {selected && <AssetDetails key={selected.id} asset={selected} onClose={() => setSelected(null)} onChanged={reload} />}
  </div>;
}
