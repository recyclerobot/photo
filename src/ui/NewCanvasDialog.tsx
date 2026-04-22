import { useState } from 'react';
import { useEditor } from '../editor/store';
import { Modal } from './Modal';

export function NewCanvasDialog({ onClose }: { onClose: () => void }) {
  const newDoc = useEditor((s) => s.newDoc);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(768);
  const [transparent, setTransparent] = useState(true);
  const [bg, setBg] = useState('#ffffff');

  const onCreate = () => {
    newDoc(
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
      transparent ? null : bg,
    );
    onClose();
  };

  return (
    <Modal title="New canvas" onClose={onClose}>
      <div className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex gap-2">
          <Field label="Width (px)">
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value, 10) || 0)}
              className="w-28 rounded bg-panel-2 px-2 py-1 text-zinc-200 outline-none"
            />
          </Field>
          <Field label="Height (px)">
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value, 10) || 0)}
              className="w-28 rounded bg-panel-2 px-2 py-1 text-zinc-200 outline-none"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              [800, 600],
              [1024, 768],
              [1920, 1080],
              [1080, 1080],
              [1080, 1920],
            ] as const
          ).map(([w, h]) => (
            <button
              key={`${w}x${h}`}
              onClick={() => {
                setWidth(w);
                setHeight(h);
              }}
              className="rounded bg-panel-2 px-2 py-1 text-xs text-zinc-300 hover:bg-panel-3"
            >
              {w}×{h}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          Transparent background
        </label>
        {!transparent && (
          <Field label="Background">
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-7 w-14 cursor-pointer rounded border border-black/30 bg-transparent"
            />
          </Field>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 hover:bg-panel-3">
            Cancel
          </button>
          <button
            onClick={onCreate}
            className="rounded bg-accent px-3 py-1.5 font-semibold text-white hover:opacity-90"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
