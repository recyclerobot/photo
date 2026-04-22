import { useEditor } from '../editor/store';

export function CanvasPanel() {
  const doc = useEditor((s) => s.doc);
  const setSize = useEditor((s) => s.setCanvasSize);
  const setBg = useEditor((s) => s.setBackgroundColor);
  const transparent = doc.backgroundColor === null;

  return (
    <div className="flex flex-col gap-2">
      <Row label="Width">
        <Num
          value={doc.widthPx}
          onChange={(v) => setSize(Math.max(1, Math.round(v)), doc.heightPx)}
        />
      </Row>
      <Row label="Height">
        <Num
          value={doc.heightPx}
          onChange={(v) => setSize(doc.widthPx, Math.max(1, Math.round(v)))}
        />
      </Row>
      <Row label="BG">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setBg(e.target.checked ? null : (doc.backgroundColor ?? '#ffffff'))}
            title="Transparent background"
          />
          <span className="text-zinc-400">Transparent</span>
          {!transparent && (
            <input
              type="color"
              value={doc.backgroundColor ?? '#ffffff'}
              onChange={(e) => setBg(e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-black/30 bg-transparent"
            />
          )}
        </div>
      </Row>
      <div className="flex flex-wrap gap-1 pt-1">
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
            onClick={() => setSize(w, h)}
            className="rounded bg-panel-2 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-panel-3"
          >
            {w}×{h}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[60px_1fr] items-center gap-2">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <div>{children}</div>
    </label>
  );
}

function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-full rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
    />
  );
}
