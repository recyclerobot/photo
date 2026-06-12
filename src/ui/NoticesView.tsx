import { useNotices } from './notices';

/** Toast stack, bottom-center. Errors/warnings from imports, autosave, etc. */
export function Notices() {
  const notices = useNotices((s) => s.notices);
  const dismiss = useNotices((s) => s.dismiss);
  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border px-3 py-2 text-xs shadow-xl backdrop-blur ${
            n.kind === 'error'
              ? 'border-red-900 bg-red-950/95 text-red-200'
              : n.kind === 'warning'
                ? 'border-amber-900 bg-amber-950/95 text-amber-200'
                : 'border-black/50 bg-panel-2/95 text-zinc-200'
          }`}
        >
          <span className="py-0.5">{n.message}</span>
          <button
            onClick={() => dismiss(n.id)}
            className="shrink-0 rounded px-1 py-0.5 opacity-70 hover:bg-black/30 hover:opacity-100"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
