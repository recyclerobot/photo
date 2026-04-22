import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CanvasDoc } from '../editor/types';
import { DEFAULT_DOC } from '../editor/types';

const uid = () => Math.random().toString(36).slice(2, 10);

export interface DesignEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  doc: CanvasDoc;
}

interface LibraryState {
  currentId: string | null;
  entries: Record<string, DesignEntry>;
  /**
   * Persist the given doc under the current entry, creating one if needed.
   * Returns the id of the active entry.
   */
  saveCurrent: (doc: CanvasDoc) => string;
  /** Create a fresh entry (used on "New canvas") and make it current. */
  createNew: (doc: CanvasDoc, name?: string) => string;
  /** Make an existing entry the current one. */
  setCurrent: (id: string) => void;
  rename: (id: string, name: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  remove: (id: string) => void;
}

const defaultName = (): string => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `Untitled ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      currentId: null,
      entries: {},

      saveCurrent: (doc) => {
        const { currentId, entries } = get();
        const now = Date.now();
        if (currentId && entries[currentId]) {
          set({
            entries: {
              ...entries,
              [currentId]: { ...entries[currentId], doc, updatedAt: now },
            },
          });
          return currentId;
        }
        const id = uid();
        const entry: DesignEntry = {
          id,
          name: defaultName(),
          createdAt: now,
          updatedAt: now,
          archived: false,
          doc,
        };
        set({ currentId: id, entries: { ...entries, [id]: entry } });
        return id;
      },

      createNew: (doc, name) => {
        const id = uid();
        const now = Date.now();
        const entry: DesignEntry = {
          id,
          name: name ?? defaultName(),
          createdAt: now,
          updatedAt: now,
          archived: false,
          doc,
        };
        set((s) => ({ currentId: id, entries: { ...s.entries, [id]: entry } }));
        return id;
      },

      setCurrent: (id) => set({ currentId: id }),

      rename: (id, name) =>
        set((s) =>
          s.entries[id]
            ? {
                entries: {
                  ...s.entries,
                  [id]: { ...s.entries[id], name, updatedAt: Date.now() },
                },
              }
            : s,
        ),

      setArchived: (id, archived) =>
        set((s) =>
          s.entries[id]
            ? {
                entries: {
                  ...s.entries,
                  [id]: { ...s.entries[id], archived, updatedAt: Date.now() },
                },
              }
            : s,
        ),

      remove: (id) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[id];
          return {
            entries: next,
            currentId: s.currentId === id ? null : s.currentId,
          };
        }),
    }),
    {
      name: 'design-library-v1',
      // Be defensive about quota: silently ignore write failures so the
      // editor keeps working even when localStorage is full.
      storage: {
        getItem: (key) => {
          try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        },
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (err) {
            console.warn('Library save failed (storage quota?):', err);
          }
        },
        removeItem: (key) => {
          try {
            localStorage.removeItem(key);
          } catch {
            /* noop */
          }
        },
      },
    },
  ),
);

/** Sorted active (non-archived) entries, newest first. */
export function listActive(entries: Record<string, DesignEntry>): DesignEntry[] {
  return Object.values(entries)
    .filter((e) => !e.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Sorted archived entries, newest first. */
export function listArchived(entries: Record<string, DesignEntry>): DesignEntry[] {
  return Object.values(entries)
    .filter((e) => e.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function isDocEmpty(doc: CanvasDoc): boolean {
  return (
    doc.layers.length === 0 &&
    doc.widthPx === DEFAULT_DOC.widthPx &&
    doc.heightPx === DEFAULT_DOC.heightPx
  );
}
