import { useEditor } from '../editor/store';
import type { Layer, ShapeLayer, TextLayer } from '../editor/types';

const FONT_FAMILIES = [
  'Inter',
  'system-ui',
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Menlo',
  'Monaco',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Comic Sans MS',
  'Impact',
  'Lucida Console',
  'Palatino',
  'Garamond',
];

export function PropertiesPanel() {
  const layer = useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedLayerId));
  const update = useEditor((s) => s.updateLayer);
  if (!layer) return null;

  const set = (patch: Partial<Layer>) => update(layer.id, patch);

  return (
    <div className="flex flex-col gap-2">
      <Row label="X">
        <Num value={layer.x} onChange={(v) => set({ x: v } as Partial<Layer>)} />
      </Row>
      <Row label="Y">
        <Num value={layer.y} onChange={(v) => set({ y: v } as Partial<Layer>)} />
      </Row>
      <Row label="W">
        <Num
          value={layer.width}
          onChange={(v) => set({ width: Math.max(1, v) } as Partial<Layer>)}
        />
      </Row>
      <Row label="H">
        <Num
          value={layer.height}
          onChange={(v) => set({ height: Math.max(1, v) } as Partial<Layer>)}
        />
      </Row>
      <Row label="Rot°">
        <Num
          value={(layer.rotation * 180) / Math.PI}
          onChange={(v) => set({ rotation: (v * Math.PI) / 180 } as Partial<Layer>)}
        />
      </Row>

      {layer.type === 'text' && <TextProps layer={layer as TextLayer} />}
      {layer.type === 'shape' && <ShapeProps layer={layer as ShapeLayer} />}
    </div>
  );
}

function ShapeProps({ layer }: { layer: ShapeLayer }) {
  const update = useEditor((s) => s.updateLayer);
  const set = (patch: Partial<ShapeLayer>) => update(layer.id, patch as Partial<Layer>);
  const fillEnabled = layer.fillColor !== null;
  const strokeEnabled = layer.strokeColor !== null;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-black/30 pt-2">
      <Row label="Shape">
        <select
          value={layer.shape}
          onChange={(e) => set({ shape: e.target.value as ShapeLayer['shape'] })}
          className="w-full rounded bg-panel-2 px-1 py-1 text-zinc-200 outline-none"
        >
          <option value="rectangle">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="line">Line</option>
          <option value="empty">Empty</option>
        </select>
      </Row>
      <Row label="Fill">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fillEnabled}
            onChange={(e) => set({ fillColor: e.target.checked ? '#5865f2' : null })}
            disabled={layer.shape === 'line' || layer.shape === 'empty'}
          />
          <input
            type="color"
            value={layer.fillColor ?? '#5865f2'}
            disabled={!fillEnabled}
            onChange={(e) => set({ fillColor: e.target.value })}
            className="h-6 w-12 cursor-pointer rounded border border-black/30 bg-transparent disabled:opacity-40"
          />
        </div>
      </Row>
      <Row label="Stroke">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={strokeEnabled}
            onChange={(e) => set({ strokeColor: e.target.checked ? '#ffffff' : null })}
            disabled={layer.shape === 'empty'}
          />
          <input
            type="color"
            value={layer.strokeColor ?? '#ffffff'}
            disabled={!strokeEnabled}
            onChange={(e) => set({ strokeColor: e.target.value })}
            className="h-6 w-12 cursor-pointer rounded border border-black/30 bg-transparent disabled:opacity-40"
          />
        </div>
      </Row>
      <Row label="Stroke W">
        <Num value={layer.strokeWidth} onChange={(v) => set({ strokeWidth: Math.max(0, v) })} />
      </Row>
      {layer.shape === 'rectangle' && (
        <Row label="Radius">
          <Num value={layer.cornerRadius} onChange={(v) => set({ cornerRadius: Math.max(0, v) })} />
        </Row>
      )}
    </div>
  );
}

function TextProps({ layer }: { layer: TextLayer }) {
  const update = useEditor((s) => s.updateLayer);
  const set = (patch: Partial<TextLayer>) => update(layer.id, patch as Partial<Layer>);
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-black/30 pt-2">
      <Row label="Text">
        <textarea
          value={layer.text}
          onChange={(e) => set({ text: e.target.value })}
          className="h-16 w-full resize-none rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
        />
      </Row>
      <Row label="Font">
        <input
          list="font-family-options"
          value={layer.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="w-full rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
        />
        <datalist id="font-family-options">
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Row>
      <Row label="Size">
        <Num value={layer.fontSize} onChange={(v) => set({ fontSize: Math.max(1, v) })} />
      </Row>
      <Row label="Weight">
        <Num value={layer.fontWeight} onChange={(v) => set({ fontWeight: v })} />
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={layer.color}
          onChange={(e) => set({ color: e.target.value })}
          className="h-6 w-12 cursor-pointer rounded border border-black/30 bg-transparent"
        />
      </Row>
      <Row label="Align">
        <select
          value={layer.align}
          onChange={(e) => set({ align: e.target.value as TextLayer['align'] })}
          className="rounded bg-panel-2 px-1 py-0.5 text-zinc-200 outline-none"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </Row>
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
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-full rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
    />
  );
}
