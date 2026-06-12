import { create } from 'zustand';

export type NoticeKind = 'error' | 'warning' | 'info';

export interface Notice {
  id: string;
  kind: NoticeKind;
  message: string;
  /** Sticky notices stay until dismissed explicitly (or via dismissNotice). */
  sticky?: boolean;
}

interface NoticesState {
  notices: Notice[];
  push: (kind: NoticeKind, message: string, opts?: { id?: string; sticky?: boolean }) => string;
  dismiss: (id: string) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const AUTO_DISMISS_MS = 6000;

export const useNotices = create<NoticesState>((set, get) => ({
  notices: [],
  push: (kind, message, opts) => {
    const id = opts?.id ?? uid();
    const sticky = opts?.sticky ?? false;
    // Replace any notice with the same id (used for stateful banners).
    set((s) => ({
      notices: [...s.notices.filter((n) => n.id !== id), { id, kind, message, sticky }],
    }));
    if (!sticky && typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));

/** Imperative helpers for non-React call sites (stores, async pipelines). */
export const notify = (
  kind: NoticeKind,
  message: string,
  opts?: { id?: string; sticky?: boolean },
): string => useNotices.getState().push(kind, message, opts);

export const dismissNotice = (id: string): void => useNotices.getState().dismiss(id);
