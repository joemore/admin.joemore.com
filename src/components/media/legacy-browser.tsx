"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Folder, HardDrive, Info, LoaderCircle, X } from "lucide-react";
import type { ExistingR2Object, ExistingR2Page } from "@/lib/media/types";
import { CopyButton } from "@/components/ui/copy-button";
import { formatBytes, formatDate, mediaRequest } from "./client";

export function LegacyBrowser() {
  const [prefix, setPrefix] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [page, setPage] = useState<ExistingR2Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<(ExistingR2Object & { contentType?: string }) | null>(null);
  const [refresh, setRefresh] = useState(0);
  const cursor = cursors.at(-1) ?? "";

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ prefix, cursor });
      void mediaRequest<ExistingR2Page>(`/api/media/legacy?${query}`, { signal: controller.signal }).then((response) => {
        if (!controller.signal.aborted) setPage(response);
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Existing R2 files could not be loaded.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [prefix, cursor, refresh]);

  function browse(next: string) { setPrefix(next); setCursors([]); setSelected(null); }
  async function inspect(object: ExistingR2Object) {
    setSelected(object);
    try {
      const response = await mediaRequest<{ object: ExistingR2Object & { contentType?: string } }>(`/api/media/legacy?${new URLSearchParams({ key: object.key })}`);
      setSelected((current) => current?.key === response.object.key ? response.object : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Object metadata could not be loaded."); }
  }

  return <section className="media-legacy panel">
    <div className="media-legacy-intro"><span className="media-legacy-icon"><HardDrive size={22} /></span><div><h2>Existing R2 Files <span className="badge">Read only</span></h2><p>Browse the bucket as it is. Older files may have no Media Library metadata. This browser cannot edit or delete objects.</p></div></div>
    <div className="media-legacy-path"><button className="media-button" type="button" disabled={loading} onClick={() => browse("")}>Bucket root</button><span>/</span>{prefix.split("/").filter(Boolean).map((segment, index, parts) => <span key={index}><button className="media-button" type="button" disabled={loading} onClick={() => browse(`${parts.slice(0, index + 1).join("/")}/`)}>{segment}</button><span>/</span></span>)}<button type="button" className="media-button media-path-refresh" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button></div>
    <p className="media-page-note"><Info size={13} />Showing one R2 page at a time in bucket order. No global search or sorting is applied.</p>
    {error && <div className="media-error" role="alert">{error}<button type="button" className="media-button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
    <div className="media-table-scroll" aria-busy={loading}>
      <table className="media-table"><thead><tr><th>Name / object key</th><th>Size</th><th>Last modified</th><th className="media-align-right">Details</th></tr></thead><tbody>
        {page?.prefixes.map((folder) => <tr key={folder}><td colSpan={3}><button className="media-file-name media-folder" type="button" disabled={loading} onClick={() => browse(folder)}><Folder size={19} />{folder.slice(prefix.length) || folder}</button></td><td className="media-align-right"><ArrowRight size={15} /></td></tr>)}
        {page?.objects.map((object) => <tr key={object.key}><td><button type="button" className="media-file-name" disabled={loading} onClick={() => void inspect(object)}><HardDrive size={17} /><span title={object.key}>{object.key.slice(prefix.length) || object.key}</span></button></td><td>{formatBytes(object.size)}</td><td>{formatDate(object.lastModified)}</td><td className="media-align-right"><button className="media-button" type="button" disabled={loading} onClick={() => void inspect(object)}>View</button></td></tr>)}
      </tbody></table>
      {loading && <div className="media-loading" role="status"><LoaderCircle size={20} className="spin" />Loading bucket objects…</div>}
      {!loading && !error && !page?.objects.length && !page?.prefixes.length && <div className="media-empty"><Folder size={30} /><h3>This prefix is empty.</h3><p>Choose another folder to keep browsing.</p></div>}
    </div>
    <div className="media-pagination"><span>Page {cursors.length + 1} · {page?.objects.length ?? 0} files, {page?.prefixes.length ?? 0} folders</span><div className="media-actions"><button className="media-button" type="button" disabled={loading || cursors.length === 0} onClick={() => setCursors((current) => current.slice(0, -1))}><ArrowLeft size={14} />Previous</button><button className="media-button" type="button" disabled={loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) setCursors((current) => [...current, page.nextCursor!]); }}>Next<ArrowRight size={14} /></button></div></div>
    {selected && <section className="media-legacy-details" aria-label="R2 object metadata"><div className="media-queue-heading"><h3>Object metadata</h3><button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close object metadata"><X size={17} /></button></div><dl className="media-metadata"><div><dt>Exact R2 key</dt><dd><code>{selected.key}</code><CopyButton value={selected.key} label="Copy object key" /></dd></div><div><dt>Size</dt><dd>{formatBytes(selected.size)}</dd></div><div><dt>Last modified</dt><dd>{formatDate(selected.lastModified)}</dd></div><div><dt>Content type</dt><dd>{selected.contentType ?? "Loading or unavailable"}</dd></div><div><dt>ETag</dt><dd><code>{selected.etag ?? "—"}</code></dd></div><div><dt>Public URL</dt><dd><code>{selected.publicUrl}</code><CopyButton value={selected.publicUrl} label="Copy public object URL" /></dd></div></dl><a className="media-button" href={selected.publicUrl} target="_blank" rel="noopener noreferrer">Open public file<ArrowUpRight size={14} /></a></section>}
  </section>;
}
