import { useState } from 'react';
import { exportPng } from '../editor/export';
import { Modal } from './Modal';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [scale, setScale] = useState<1 | 2 | 3>(1);
  const [transparent, setTransparent] = useState(true);
  const [bg, setBg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await exportPng({ scale, transparent, backgroundColor: transparent ? undefined : bg });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export PNG" onClose={onClose}>
      <div className="flex flex-col gap-3 p-4 text-sm">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Scale</div>
          <div className="flex gap-1">
            {([1, 2, 3] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`flex-1 rounded px-2 py-1 ${
                  scale === s ? 'bg-accent text-white' : 'bg-panel-2 text-zinc-300 hover:bg-panel-3'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
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
          <label className="flex items-center gap-2">
            Background:
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="h-7 w-14 cursor-pointer rounded border border-black/30 bg-transparent"
            />
          </label>
        )}

        <div className="text-[11px] text-zinc-500">Crop is fixed to canvas bounds.</div>

        {error && <div className="rounded bg-red-900/40 px-2 py-1 text-red-300">{error}</div>}

        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 hover:bg-panel-3">
            Cancel
          </button>
          <button
            onClick={onExport}
            disabled={busy}
            className="rounded bg-accent px-3 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Exporting…' : 'Download'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
