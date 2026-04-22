import { useEffect, useRef, useState } from 'react';
import { useUI, type WindowKey } from './uiStore';

interface Props {
  windowKey: WindowKey;
  title: string;
  onClose?: () => void;
  minW?: number;
  minH?: number;
  children: React.ReactNode;
}

type DragMode =
  | { kind: 'move'; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: 'resize';
      startX: number;
      startY: number;
      origW: number;
      origH: number;
      origX: number;
      origY: number;
      edges: { l: boolean; r: boolean; t: boolean; b: boolean };
    }
  | null;

export function FloatingWindow({
  windowKey,
  title,
  onClose,
  minW = 200,
  minH = 120,
  children,
}: Props) {
  const rect = useUI((s) => s.windows[windowKey]);
  const setWindow = useUI((s) => s.setWindow);
  const [drag, setDrag] = useState<DragMode>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Clamp into viewport on mount or window resize.
  useEffect(() => {
    const clamp = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(rect.w, Math.max(minW, vw - 16));
      const h = Math.min(rect.h, Math.max(minH, vh - 56));
      const x = Math.max(0, Math.min(rect.x, vw - w));
      const y = Math.max(40, Math.min(rect.y, vh - 40));
      if (x !== rect.x || y !== rect.y || w !== rect.w || h !== rect.h) {
        setWindow(windowKey, { x, y, w, h });
      }
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
    // Only clamp on mount and viewport resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (drag.kind === 'move') {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const x = Math.max(0, Math.min(vw - rect.w, drag.origX + dx));
        const y = Math.max(40, Math.min(vh - 32, drag.origY + dy));
        setWindow(windowKey, { x, y });
      } else if (drag.kind === 'resize') {
        let { origX: x, origY: y, origW: w, origH: h } = drag;
        if (drag.edges.r) w = Math.max(minW, drag.origW + dx);
        if (drag.edges.b) h = Math.max(minH, drag.origH + dy);
        if (drag.edges.l) {
          const newW = Math.max(minW, drag.origW - dx);
          x = drag.origX + (drag.origW - newW);
          w = newW;
        }
        if (drag.edges.t) {
          const newH = Math.max(minH, drag.origH - dy);
          y = Math.max(40, drag.origY + (drag.origH - newH));
          h = drag.origY + drag.origH - y;
        }
        setWindow(windowKey, { x, y, w, h });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, rect.w, rect.h, minW, minH, setWindow, windowKey]);

  const startMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-window-close]')) return;
    e.preventDefault();
    setDrag({
      kind: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.x,
      origY: rect.y,
    });
  };

  const startResize =
    (edges: { l?: boolean; r?: boolean; t?: boolean; b?: boolean }) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag({
        kind: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        origW: rect.w,
        origH: rect.h,
        origX: rect.x,
        origY: rect.y,
        edges: { l: !!edges.l, r: !!edges.r, t: !!edges.t, b: !!edges.b },
      });
    };

  return (
    <div
      ref={ref}
      data-ui-overlay
      className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-black/40 bg-panel/95 text-xs text-zinc-200 shadow-xl backdrop-blur"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div
        onPointerDown={startMove}
        className="flex h-7 select-none items-center justify-between border-b border-black/40 bg-panel-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
        style={{ cursor: drag?.kind === 'move' ? 'grabbing' : 'grab' }}
      >
        <span className="truncate">{title}</span>
        {onClose && (
          <button
            data-window-close
            onClick={onClose}
            className="ml-2 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-black/40 hover:text-zinc-100"
            title="Close"
          >
            ×
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>

      {/* Resize edges + corners */}
      <div
        onPointerDown={startResize({ t: true })}
        className="absolute inset-x-2 top-0 h-1 cursor-ns-resize"
      />
      <div
        onPointerDown={startResize({ b: true })}
        className="absolute inset-x-2 bottom-0 h-1 cursor-ns-resize"
      />
      <div
        onPointerDown={startResize({ l: true })}
        className="absolute inset-y-2 left-0 w-1 cursor-ew-resize"
      />
      <div
        onPointerDown={startResize({ r: true })}
        className="absolute inset-y-2 right-0 w-1 cursor-ew-resize"
      />
      <div
        onPointerDown={startResize({ t: true, l: true })}
        className="absolute left-0 top-0 h-2 w-2 cursor-nwse-resize"
      />
      <div
        onPointerDown={startResize({ t: true, r: true })}
        className="absolute right-0 top-0 h-2 w-2 cursor-nesw-resize"
      />
      <div
        onPointerDown={startResize({ b: true, l: true })}
        className="absolute bottom-0 left-0 h-2 w-2 cursor-nesw-resize"
      />
      <div
        onPointerDown={startResize({ b: true, r: true })}
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
      />
    </div>
  );
}
