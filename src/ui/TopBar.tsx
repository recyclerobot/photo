import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../editor/store';
import { importImageFiles } from '../editor/export';
import { listActive, useLibrary } from '../library/libraryStore';
import { PANEL_LABELS, useUI, type PanelKey } from './uiStore';

interface Props {
  onNew: () => void;
  onExport: () => void;
  onOpenLibrary: () => void;
}

export function TopBar({ onNew, onExport, onOpenLibrary }: Props) {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const zoom = useEditor((s) => s.view.zoom);
  const setView = useEditor((s) => s.setView);
  const doc = useEditor((s) => s.doc);
  const setPanel = useUI((s) => s.setPanel);

  const onImportClick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.onchange = () => inp.files && importImageFiles(inp.files);
    inp.click();
  };

  return (
    <div className="pointer-events-auto absolute left-0 right-0 top-0 z-40 flex items-center gap-1 border-b border-black/40 bg-panel/90 px-2 py-1.5 text-xs backdrop-blur">
      <FileMenu onNew={onNew} onOpenLibrary={onOpenLibrary} />
      <Btn onClick={onImportClick}>Import image</Btn>
      <Btn onClick={onExport}>Export PNG</Btn>
      <ViewMenu />
      <Sep />
      <Btn onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
        ↶ Undo
      </Btn>
      <Btn onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">
        ↷ Redo
      </Btn>
      <Sep />
      <button
        onClick={() => setPanel('canvas', true)}
        title="Open Canvas panel"
        className="rounded px-2 py-1 text-zinc-300 hover:bg-panel-3"
      >
        {doc.widthPx} × {doc.heightPx} px
      </button>
      <div className="ml-auto flex items-center gap-1">
        <Btn onClick={() => setView({ zoom: Math.max(0.1, zoom / 1.2) })}>−</Btn>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Btn onClick={() => setView({ zoom: Math.min(8, zoom * 1.2) })}>+</Btn>
        <Btn onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}>Fit</Btn>
      </div>
    </div>
  );
}

function FileMenu({ onNew, onOpenLibrary }: { onNew: () => void; onOpenLibrary: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const entries = useLibrary((s) => s.entries);
  const currentId = useLibrary((s) => s.currentId);
  const current = currentId ? entries[currentId] : null;
  const recent = listActive(entries).slice(0, 5);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openEntry = (id: string) => {
    const entry = useLibrary.getState().entries[id];
    if (!entry) return;
    // Flush in-progress save into the current entry, then switch.
    useLibrary.getState().saveCurrent(useEditor.getState().doc);
    useLibrary.getState().setCurrent(id);
    useEditor.getState().setDoc(entry.doc, { record: false });
    setOpen(false);
  };

  const renameCurrent = () => {
    if (!current) return;
    const next = prompt('Rename canvas', current.name);
    if (next != null) {
      const trimmed = next.trim();
      if (trimmed) useLibrary.getState().rename(current.id, trimmed);
    }
    setOpen(false);
  };

  const archiveCurrent = () => {
    if (!current) return;
    useLibrary.getState().setArchived(current.id, true);
    // Open something else, or start fresh.
    const remaining = listActive(useLibrary.getState().entries).filter((e) => e.id !== current.id);
    if (remaining[0]) {
      openEntry(remaining[0].id);
    } else {
      useEditor.getState().newDoc(1024, 768, null);
      useLibrary.getState().createNew(useEditor.getState().doc);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Btn onClick={() => setOpen((o) => !o)} title={current ? `File — ${current.name}` : 'File'}>
        File ▾
      </Btn>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-md border border-black/50 bg-panel-2 py-1 shadow-xl">
          {current && (
            <div className="border-b border-black/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
              Current: <span className="text-zinc-300 normal-case">{current.name}</span>
            </div>
          )}
          <MenuItem
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            New canvas…
          </MenuItem>
          <MenuItem onClick={renameCurrent} disabled={!current}>
            Rename current canvas…
          </MenuItem>
          <MenuItem onClick={archiveCurrent} disabled={!current}>
            Archive current canvas
          </MenuItem>
          <div className="my-1 h-px bg-black/40" />
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">Recent</div>
          {recent.length === 0 && (
            <div className="px-3 py-1.5 text-zinc-500">No recent designs</div>
          )}
          {recent.map((e) => (
            <MenuItem key={e.id} onClick={() => openEntry(e.id)}>
              <span className="flex w-full items-center gap-2">
                <span className="w-3 text-accent">{e.id === currentId ? '✓' : ''}</span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">
                  {e.doc.widthPx}×{e.doc.heightPx}
                </span>
              </span>
            </MenuItem>
          ))}
          <div className="my-1 h-px bg-black/40" />
          <MenuItem
            onClick={() => {
              setOpen(false);
              onOpenLibrary();
            }}
          >
            All designs…
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 enabled:hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-zinc-600"
    >
      {children}
    </button>
  );
}

function ViewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const panels = useUI((s) => s.panels);
  const toggle = useUI((s) => s.togglePanel);
  const setPanel = useUI((s) => s.setPanel);
  const resetWindows = useUI((s) => s.resetWindows);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const order: PanelKey[] = ['leftToolbar', 'canvas', 'layers', 'properties', 'effects'];
  const allOn = order.every((k) => panels[k]);

  return (
    <div ref={ref} className="relative">
      <Btn onClick={() => setOpen((o) => !o)} title="View">
        View ▾
      </Btn>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-md border border-black/50 bg-panel-2 py-1 shadow-xl">
          {order.map((k) => (
            <button
              key={k}
              onClick={() => toggle(k)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-panel-3"
            >
              <span className="w-3 text-accent">{panels[k] ? '✓' : ''}</span>
              <span>{PANEL_LABELS[k]}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-black/40" />
          <button
            onClick={() => order.forEach((k) => setPanel(k, !allOn))}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-300 hover:bg-panel-3"
          >
            <span className="w-3" />
            <span>{allOn ? 'Hide all panels' : 'Show all panels'}</span>
          </button>
          <button
            onClick={() => {
              resetWindows();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-300 hover:bg-panel-3"
          >
            <span className="w-3" />
            <span>Reset window positions</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded px-2 py-1 text-zinc-200 hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-zinc-500"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-zinc-700" />;
}
