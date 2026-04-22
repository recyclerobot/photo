import { useEffect } from 'react';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-ui-overlay
      className="absolute inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[380px] overflow-hidden rounded-lg border border-black/40 bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/40 bg-panel-2 px-3 py-2">
          <div className="text-sm font-semibold text-zinc-200">{title}</div>
          <button onClick={onClose} className="rounded px-2 py-0.5 text-zinc-400 hover:bg-panel-3">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
