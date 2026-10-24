"use client";

import { ArchiveManageAccess } from "./archive-manage-access";
import { ArchiveVerification } from "./archive-verification";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Folder, FolderPlus, LayoutGrid, List, Search, ChevronRight, Download, Move, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ArchiveCategoryIconGlyph } from "./archive-data";
import { archiveFolderIcons, type ArchiveFolderIcon, type FolderRecord, type OrganizationCommand } from "@/lib/archive-folders/contracts";
import type { FolderFile, FolderWorkspace } from "@/lib/archive-folders/service";

type Target = { kind: "folder"; item: FolderRecord } | { kind: "file"; item: FolderFile };
type Editor = { kind: "create" } | { kind: "rename"; item: FolderRecord } | { kind: "move"; target: Target } | { kind: "delete"; item: FolderRecord };
const dragType = "application/x-flux-archive-organization";

export function ArchiveFolderWorkspace({ categoryId, categoryName, slug, folderId, verificationEnabled = false, sharingEnabled = false }: { sharingEnabled?: boolean; verificationEnabled?: boolean; categoryId: string; categoryName: string; slug: string; folderId: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<FolderWorkspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<ArchiveFolderIcon>("folder");
  const [destination, setDestination] = useState("");
  const [commandId, setCommandId] = useState("");
  const [dialogError, setDialogError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const requestNumber = useRef(0);
  const cursor = cursors.at(-1) ?? "";
  const url = `/api/archives/organization?${new URLSearchParams({ categoryId, folderId: folderId ?? "", search, cursor })}`;
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestNumber.current;
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to open this folder.");
      if (!signal?.aborted && request === requestNumber.current) { setData(body); setError(""); }
    } catch (e) {
      if (!signal?.aborted && request === requestNumber.current) { setData(null); setError(e instanceof Error ? e.message : "Unable to load folder."); }
    } finally { if (!signal?.aborted && request === requestNumber.current) setLoading(false); }
  }, [url]);
  // load writes state only after a network response; cancellation rejects stale responses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => { controller.abort(); }; }, [load]);
  useEffect(() => { if (editor) dialog.current?.showModal(); else dialog.current?.close(); }, [editor]);

  function href(id: string | null) { return `/archives/${slug}${id ? `?folder=${encodeURIComponent(id)}` : ""}`; }
  function openEditor(value: Editor, parentId = "") {
    setDialogError(""); setNotice(""); setCommandId(crypto.randomUUID()); setEditor(value); setDestination(parentId);
    setName(value.kind === "rename" ? value.item.name : "");
    setDescription(value.kind === "rename" ? value.item.description : "");
    setIcon(value.kind === "rename" ? value.item.icon as ArchiveFolderIcon : "folder");
  }
  function drag(event: DragEvent, target: Target) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(dragType, JSON.stringify({ kind: target.kind, id: target.item.id }));
  }
  function drop(event: DragEvent, parentId: string | null) {
    event.preventDefault(); event.stopPropagation();
    if (!data || busy || loading || !data.canManage) return;
    try {
      const payload = JSON.parse(event.dataTransfer.getData(dragType));
      if (payload.kind === "folder") {
        const item = data.folders.find(f => f.id === payload.id);
        if (item) openEditor({ kind: "move", target: { kind: "folder", item } }, parentId ?? "");
      } else if (payload.kind === "file" && data.canMoveFiles) {
        const item = data.files.find(f => f.id === payload.id);
        if (item) openEditor({ kind: "move", target: { kind: "file", item } }, parentId ?? "");
      }
    } catch { /* Ignore unrelated drag payloads. */ }
  }
  function dragOver(event: DragEvent) { if (data?.canManage && event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }
  function isDestination(folder: FolderRecord) {
    if (editor?.kind !== "move" || editor.target.kind !== "folder") return true;
    let current: FolderRecord | undefined = folder;
    const seen = new Set<string>();
    while (current) {
      if (current.id === editor.target.item.id || seen.has(current.id)) return false;
      seen.add(current.id); current = data?.folders.find(f => f.id === current!.parentId);
    }
    return true;
  }
  function folderPath(folder: FolderRecord) {
    const names = [folder.name]; let parent = folder.parentId; const seen = new Set([folder.id]);
    while (parent && !seen.has(parent)) { seen.add(parent); const found = data?.folders.find(f => f.id === parent); if (!found) break; names.unshift(found.name); parent = found.parentId; }
    return names.join(" / ");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    const base = { commandId, categoryId };
    let command: OrganizationCommand;
    if (editor.kind === "create") command = { ...base, action: "create", name, description, icon, parentId: folderId };
    else if (editor.kind === "rename") command = { ...base, action: "rename", folderId: editor.item.id, expectedRevision: editor.item.revision, name, description, icon };
    else if (editor.kind === "delete") command = { ...base, action: "delete-folder", folderId: editor.item.id, expectedRevision: editor.item.revision };
    else if (editor.target.kind === "folder") command = { ...base, action: "move-folder", folderId: editor.target.item.id, expectedRevision: editor.target.item.revision, parentId: destination || null };
    else command = { ...base, action: "move-file", fileId: editor.target.item.id, fileKind: editor.target.item.kind, expectedRevision: editor.target.item.revision, folderId: destination || null };
    setBusy(true); setDialogError("");
    try {
      const response = await fetch("/api/archives/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save organization.");
      setEditor(null);
      setLoading(true);
      await load(); // No optimistic movement. Render only the server's persisted state.
      setNotice(editor.kind === "move" ? "Move saved." : editor.kind === "delete" ? "Empty folder deleted." : "Folder saved.");
      router.refresh();
    } catch (e) { setDialogError(e instanceof Error ? e.message : "Unable to save. Retry the same command to check its outcome."); }
    finally { setBusy(false); }
  }
  function tree(parentId: string | null, depth = 0): React.ReactNode {
    if (!data || depth > 64) return null;
    return data.folders.filter(f => f.parentId === parentId).map(f => (
      <li key={f.id} className="my-1">
        <Link href={href(f.id)} aria-current={folderId === f.id ? "page" : undefined} data-folder-drop={f.id}
          onDragOver={dragOver} onDrop={event => drop(event, f.id)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[#e9f0e9] ${folderId === f.id ? "bg-[#e9f0e9] font-semibold text-brand" : "text-[#526355]"}`}>
          <Folder className="h-4 w-4 shrink-0" /><span className="break-words">{f.name}</span>
        </Link>
        {data.folders.some(child => child.parentId === f.id) ? <ul className="ml-3 border-l border-line pl-1">{tree(f.id, depth + 1)}</ul> : null}
      </li>
    ));
  }
  const current = data?.breadcrumbs.at(-1);
  const children = data?.folders.filter(f => f.parentId === folderId) ?? [];
  const title = editor?.kind === "create" ? "Create folder" : editor?.kind === "rename" ? "Edit folder" : editor?.kind === "delete" ? "Delete empty folder" : "Move item";
  const inputClass = "mt-2 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";
  return <section className="space-y-6" aria-busy={loading || busy}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/archives" className="text-sm text-brand">← All categories</Link><h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#14241a]">{categoryName}</h1><p className="mt-2 text-sm text-[#647267]">Browse and organize your archived files.</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><Link href={`/archives/${slug}?view=all`}>All files & details</Link></Button>{data?.canManage && <Button asChild variant="secondary"><Link href="/archives/settings/categories">Manage categories</Link></Button>}</div>
    </header>
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-line bg-surface p-4"><nav aria-label="Archive folders"><h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#738278]">Folders</h2>
        <Link href={href(null)} data-folder-drop="root" onDragOver={dragOver} onDrop={e => drop(e, null)} aria-current={!folderId ? "page" : undefined} className="block rounded-lg px-3 py-2 text-sm font-semibold text-brand">Category root</Link>
        <ul>{tree(null)}</ul></nav></aside>
      <main className="min-w-0 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[#647267]"><Link href="/archives">Archives</Link><ChevronRight className="h-3 w-3" /><Link href={href(null)}>{categoryName}</Link>{data?.breadcrumbs.map(f => <span key={f.id} className="flex items-center gap-2"><ChevronRight className="h-3 w-3" /><Link aria-current={f.id === folderId ? "page" : undefined} href={href(f.id)}>{f.name}</Link></span>)}</nav>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">{current?.name ?? "Category root"}</h2>{current?.description && <p className="mt-1 max-w-2xl whitespace-pre-wrap text-sm text-[#647267]">{current.description}</p>}</div>
          {data?.canManage && <Button disabled={loading || busy} onClick={() => openEditor({ kind: "create" })}><FolderPlus className="h-4 w-4" />New folder</Button>}</div>
        <div className="my-5 flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={e => { e.preventDefault(); setLoading(true); if (search === searchInput && !cursors.length) void load(); else { setCursors([]); setSearch(searchInput); } }} className="flex max-w-md flex-1 gap-2"><Input aria-label="Search files in this folder" placeholder="Search files in this folder" maxLength={120} value={searchInput} onChange={e => setSearchInput(e.target.value)} /><Button type="submit" variant="secondary" aria-label="Search folder"><Search className="h-4 w-4" /></Button></form>
          <div className="flex gap-1"><Button variant="secondary" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid className="h-4 w-4" /></Button><Button variant="secondary" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List className="h-4 w-4" /></Button></div>
        </div>
        {notice && <p role="status" className="mb-3 text-sm text-brand">{notice}</p>}
        {loading ? <p role="status" className="py-12 text-center text-[#647267]">Loading folder…</p> : error ? <div role="alert" className="py-8 text-center"><p>{error}</p><Button variant="secondary" className="mt-3" onClick={() => { setLoading(true); void load(); }}>Retry</Button></div> : data && <>
          <p className="mb-4 text-xs text-[#647267]">{children.length} folders · {data.total} files{data.canManage ? " · Use Move or drag an item onto a folder." : ""}</p>
          <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
            {children.map(f => <article key={f.id} data-folder-card={f.name} draggable={data.canManage && !busy} onDragStart={e => drag(e, { kind: "folder", item: f })} onDragOver={dragOver} onDrop={e => drop(e, f.id)} className="rounded-2xl border border-line bg-white p-4 hover:border-[#9eb7a5]">
              <Link href={href(f.id)} className="flex items-center gap-3 font-semibold text-[#244a32]">{f.icon === "folder" ? <Folder className="h-7 w-7 shrink-0" /> : <ArchiveCategoryIconGlyph iconKey={f.icon} className="h-7 w-7 shrink-0" />}<span className="break-words">{f.name}</span></Link>
              {f.description && <p className="mt-2 line-clamp-2 text-xs text-[#647267]">{f.description}</p>}
              {data.canManage && <div className="mt-3 flex flex-wrap gap-2"><button className="flex items-center gap-1 text-xs text-brand" aria-label={`Edit ${f.name}`} onClick={() => openEditor({ kind: "rename", item: f })}><Pencil className="h-3 w-3" />Edit</button><button className="flex items-center gap-1 text-xs text-brand" aria-label={`Move ${f.name}`} onClick={() => openEditor({ kind: "move", target: { kind: "folder", item: f } }, f.parentId ?? "")}><Move className="h-3 w-3" />Move</button>{data.canDeleteFolders && <button className="flex items-center gap-1 text-xs text-[#a83e3e]" aria-label={`Delete ${f.name}`} onClick={() => openEditor({ kind: "delete", item: f })}><Trash2 className="h-3 w-3" />Delete</button>}</div>}
            </article>)}
            {data.files.map(file => <article key={file.key} data-file-card={file.name} draggable={data.canMoveFiles && !busy} onDragStart={e => drag(e, { kind: "file", item: file })} className="rounded-2xl border border-line bg-white p-4">
              <h3 className="break-words text-sm font-semibold">{file.name}</h3><p className="mt-1 text-xs text-[#647267]">{file.projectName || "Direct upload"}{file.sourceRevision !== null ? ` · Revision ${file.sourceRevision}` : ""} · {Math.max(1, Math.ceil(file.fileSize / 1024))} KB</p>
              <div className="mt-3 flex flex-wrap items-center gap-3"><AssetPreviewButton fileName={file.name} mimeType={file.mimeType} previewPath={`/api/archives/files/${file.id}/preview`} /><a className="flex items-center gap-1 text-xs text-brand" href={`/api/archives/files/${file.id}/download`}><Download className="h-3 w-3" />Download</a>{data.canMoveFiles && <button className="flex items-center gap-1 text-xs text-brand" aria-label={`Move ${file.name}`} onClick={() => openEditor({ kind: "move", target: { kind: "file", item: file } }, file.folderId ?? "")}><Move className="h-3 w-3" />Move</button>}<Link className="text-xs text-brand" href={`/archives/${slug}?view=all&search=${encodeURIComponent(file.name)}`}>Details</Link></div>
              {sharingEnabled && data.canManageAccess && <ArchiveManageAccess fileId={file.id} />}
              {verificationEnabled && <ArchiveVerification sourceId={file.id} sourceKind={file.kind} categoryId={categoryId} />}
            </article>)}
          </div>
          {!children.length && !data.files.length && <div className="py-16 text-center text-[#647267]"><Folder className="mx-auto mb-3 h-10 w-10 text-[#a9bbaf]" /><h3 className="text-lg font-semibold">{search ? "No matching files" : "This folder is empty"}</h3><p className="mt-1 text-sm">{search ? "Try another filename." : data.canManage ? "Create a folder or move files here from the category root." : "There are no files available to you here."}</p></div>}
          <div className="mt-5 flex items-center justify-end gap-3"><Button variant="secondary" disabled={!cursors.length} onClick={() => { setLoading(true); setCursors(c => c.slice(0, -1)); }}>Previous</Button><span className="text-xs text-[#647267]">Page {cursors.length + 1}</span><Button variant="secondary" disabled={!data.nextCursor} onClick={() => { setLoading(true); setCursors(c => [...c, data.nextCursor!]); }}>Next</Button></div>
        </>}
      </main>
    </div>
    <dialog ref={dialog} aria-labelledby="archive-folder-dialog-title" onCancel={e => { if (busy) e.preventDefault(); else setEditor(null); }} className="m-auto w-[min(520px,calc(100%-2rem))] rounded-3xl border border-line bg-white p-6 shadow-xl backdrop:bg-[#112118]/45">
      <form onSubmit={submit}><h2 id="archive-folder-dialog-title" className="text-2xl font-semibold">{title}</h2>
        {editor?.kind === "create" || editor?.kind === "rename" ? <div className="my-5 space-y-4"><label className="block text-sm">Folder name<input disabled={busy} autoFocus required maxLength={120} value={name} onChange={e => { setName(e.target.value); setCommandId(crypto.randomUUID()); }} className={inputClass} /></label><label className="block text-sm">Description<textarea disabled={busy} maxLength={2000} value={description} onChange={e => { setDescription(e.target.value); setCommandId(crypto.randomUUID()); }} className={inputClass} /></label><label className="block text-sm">Folder icon<select aria-label="Folder icon" disabled={busy} value={icon} onChange={e => { setIcon(e.target.value as ArchiveFolderIcon); setCommandId(crypto.randomUUID()); }} className={inputClass}>{archiveFolderIcons.map(i => <option key={i} value={i}>{i}</option>)}</select></label></div> : editor?.kind === "move" ? <div className="my-5"><p className="mb-3 text-sm">Move <strong>{editor.target.item.name}</strong> to:</p><label className="block text-sm">Destination folder<select size={6} aria-label="Destination folder" disabled={busy} autoFocus value={destination} onChange={e => { setDestination(e.target.value); setCommandId(crypto.randomUUID()); }} className={inputClass}><option value="">Category root</option>{data?.folders.filter(isDestination).map(f => <option key={f.id} value={f.id}>{folderPath(f)}</option>)}</select></label><p className="mt-3 text-xs text-[#647267]">File access and version history stay the same.</p></div> : <p className="my-5 text-sm">Delete “{editor?.kind === "delete" ? editor.item.name : ""}”? Only empty folders can be deleted.</p>}
        {dialogError && <p role="alert" className="mb-4 text-sm text-[#a83e3e]">{dialogError}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : editor?.kind === "move" ? "Confirm move" : editor?.kind === "delete" ? "Delete folder" : "Save folder"}</Button></div>
      </form>
    </dialog>
  </section>;
}
