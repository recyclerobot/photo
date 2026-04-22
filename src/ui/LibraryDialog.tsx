import { useState } from 'react';
import { useEditor } from '../editor/store';
import { listActive, listArchived, useLibrary, type DesignEntry } from '../library/libraryStore';
import { Modal } from './Modal';

export function LibraryDialog({ onClose }: { onClose: () => void }) {
  const entries = useLibrary((s) => s.entries);
  const currentId = useLibrary((s) => s.currentId);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const list = tab === 'active' ? listActive(entries) : listArchived(entries);

  const open = (e: DesignEntry) => {
    // Flush in-progress save into the previous entry, then switch.
    useLibrary.getState().saveCurrent(useEditor.getState().doc);
    useLibrary.getState().setCurrent(e.id);
    useEditor.getState().setDoc(e.doc, { record: false });
    onClose();
  };

  const startRename = (e: DesignEntry) => {
    setEditingId(e.id);
    setDraftName(e.name);
  };
  const commitRename = () => {
    if (editingId) useLibrary.getState().rename(editingId, draftName.trim() || 'Untitled');
    setEditingId(null);
  };

  return (
    <Modal title="Designs" onClose={onClose} width={640}>
      <div className="flex flex-col">
        <div className="flex border-b border-black/40 bg-panel-2 text-xs">
          <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
            Active ({listActive(entries).length})
          </TabButton>
          <TabButton active={tab === 'archived'} onClick={() => setTab('archived')}>
            Archived ({listArchived(entries).length})
          </TabButton>
        </div>

        <div className="max-h-[60vh] overflow-auto">
          {list.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-zinc-500">
              {tab === 'active' ? 'No designs yet.' : 'No archived designs.'}
            </div>
          )}
          {list.map((e) => {
            const isCurrent = e.id === currentId;
            const isEditing = e.id === editingId;
            return (
              <div
                key={e.id}
                className={`flex items-center gap-2 border-b border-black/20 px-3 py-2 text-xs ${
                  isCurrent ? 'bg-panel-3/50' : 'hover:bg-panel-2/60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(ev) => setDraftName(ev.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') commitRename();
                        else if (ev.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full rounded bg-panel-3 px-1.5 py-1 text-zinc-200 outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => open(e)}
                      className="block w-full truncate text-left text-zinc-200 hover:underline"
                      title="Open"
                    >
                      {e.name}
                      {isCurrent && (
                        <span className="ml-2 rounded bg-accent/30 px-1 py-0.5 text-[10px] uppercase text-accent">
                          current
                        </span>
                      )}
                    </button>
                  )}
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    {e.doc.widthPx}×{e.doc.heightPx} · {e.doc.layers.length} layer
                    {e.doc.layers.length === 1 ? '' : 's'} · updated {formatRelative(e.updatedAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <RowBtn onClick={() => open(e)}>Open</RowBtn>
                  <RowBtn onClick={() => startRename(e)}>Rename</RowBtn>
                  {tab === 'active' ? (
                    <RowBtn onClick={() => useLibrary.getState().setArchived(e.id, true)}>
                      Archive
                    </RowBtn>
                  ) : (
                    <>
                      <RowBtn onClick={() => useLibrary.getState().setArchived(e.id, false)}>
                        Restore
                      </RowBtn>
                      <RowBtn
                        danger
                        onClick={() => {
                          if (confirm(`Permanently delete "${e.name}"?`)) {
                            useLibrary.getState().remove(e.id);
                          }
                        }}
                      >
                        Delete
                      </RowBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/40 bg-panel-2 px-3 py-2">
          <button
            onClick={onClose}
            className="rounded bg-panel-3 px-3 py-1.5 text-xs text-zinc-200 hover:bg-panel-3/70"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-zinc-300 ${
        active
          ? 'border-b-2 border-accent text-zinc-100'
          : 'border-b-2 border-transparent hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}

function RowBtn({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] ${
        danger
          ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
          : 'bg-panel-3 text-zinc-200 hover:bg-panel-3/70'
      }`}
    >
      {children}
    </button>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
