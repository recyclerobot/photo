import { useEditor, flatObjects } from '../editor/store';
import type { ImageObject, LayerObject, ShapeObject, TextObject } from '../editor/types';
import { useLocalFonts } from './useLocalFonts';

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
  const obj = useEditor((s) => {
    if (!s.selectedObjectId) return undefined;
    for (const { object } of flatObjects(s.doc)) {
      if (object.id === s.selectedObjectId) return object;
    }
    return undefined;
  });
  const update = useEditor((s) => s.updateObject);
  if (!obj) return null;

  const set = (patch: Partial<LayerObject>) => update(obj.id, patch);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <CompactRow label="X">
          <Num value={obj.x} onChange={(v) => set({ x: v } as Partial<LayerObject>)} />
        </CompactRow>
        <CompactRow label="Y">
          <Num value={obj.y} onChange={(v) => set({ y: v } as Partial<LayerObject>)} />
        </CompactRow>
        <CompactRow label="W">
          <Num
            value={obj.width}
            onChange={(v) => set({ width: Math.max(1, v) } as Partial<LayerObject>)}
          />
        </CompactRow>
        <CompactRow label="H">
          <Num
            value={obj.height}
            onChange={(v) => set({ height: Math.max(1, v) } as Partial<LayerObject>)}
          />
        </CompactRow>
      </div>
      <Row label="Rot°">
        <Num
          value={(obj.rotation * 180) / Math.PI}
          onChange={(v) => set({ rotation: (v * Math.PI) / 180 } as Partial<LayerObject>)}
        />
      </Row>

      {obj.type === 'text' && <TextProps object={obj as TextObject} />}
      {obj.type === 'shape' && <ShapeProps object={obj as ShapeObject} />}
      {obj.type === 'image' && <ImageProps object={obj as ImageObject} />}
    </div>
  );
}

function ImageProps({ object }: { object: ImageObject }) {
  const update = useEditor((s) => s.updateObject);
  const nW = object.naturalWidth;
  const nH = object.naturalHeight;
  const curW = Math.round(object.width);
  const curH = Math.round(object.height);
  const scaleX = nW > 0 ? (object.width / nW) * 100 : 100;
  const scaleY = nH > 0 ? (object.height / nH) * 100 : 100;
  const atNatural = curW === nW && curH === nH;
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-black/30 pt-2">
      <Row label="File">
        <div className="truncate text-[11px] text-zinc-300" title={object.name}>
          {object.name || 'Image'}
        </div>
      </Row>
      <Row label="Original">
        <div className="text-[11px] text-zinc-400">
          {nW} × {nH} px
        </div>
      </Row>
      <Row label="Current">
        <div className="text-[11px] text-zinc-300">
          {curW} × {curH} px
          <span className="ml-2 text-zinc-500">
            ({Math.round(scaleX)}% × {Math.round(scaleY)}%)
          </span>
        </div>
      </Row>
      <Row label="">
        <button
          type="button"
          disabled={atNatural}
          onClick={() =>
            update(object.id, {
              width: nW,
              height: nH,
              x: object.x + (object.width - nW) / 2,
              y: object.y + (object.height - nH) / 2,
            } as Partial<LayerObject>)
          }
          className="rounded bg-panel-2 px-2 py-1 text-[11px] text-zinc-200 hover:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset to original size
        </button>
      </Row>
    </div>
  );
}

function ShapeProps({ object }: { object: ShapeObject }) {
  const update = useEditor((s) => s.updateObject);
  const set = (patch: Partial<ShapeObject>) => update(object.id, patch as Partial<LayerObject>);
  const fillEnabled = object.fillColor !== null;
  const strokeEnabled = object.strokeColor !== null;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-black/30 pt-2">
      <Row label="Shape">
        <select
          value={object.shape}
          onChange={(e) => set({ shape: e.target.value as ShapeObject['shape'] })}
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
            disabled={object.shape === 'line' || object.shape === 'empty'}
          />
          <input
            type="color"
            value={object.fillColor ?? '#5865f2'}
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
            disabled={object.shape === 'empty'}
          />
          <input
            type="color"
            value={object.strokeColor ?? '#ffffff'}
            disabled={!strokeEnabled}
            onChange={(e) => set({ strokeColor: e.target.value })}
            className="h-6 w-12 cursor-pointer rounded border border-black/30 bg-transparent disabled:opacity-40"
          />
        </div>
      </Row>
      <Row label="Stroke W">
        <Num value={object.strokeWidth} onChange={(v) => set({ strokeWidth: Math.max(0, v) })} />
      </Row>
      {object.shape === 'rectangle' && (
        <Row label="Radius">
          <Num
            value={object.cornerRadius}
            onChange={(v) => set({ cornerRadius: Math.max(0, v) })}
          />
        </Row>
      )}
    </div>
  );
}

function TextProps({ object }: { object: TextObject }) {
  const update = useEditor((s) => s.updateObject);
  const set = (patch: Partial<TextObject>) => update(object.id, patch as Partial<LayerObject>);
  const localFonts = useLocalFonts();
  const families = localFonts.fonts.length ? localFonts.fonts : FONT_FAMILIES;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-black/30 pt-2">
      <Row label="Text">
        <textarea
          value={object.text}
          onChange={(e) => set({ text: e.target.value })}
          className="h-16 w-full resize-none rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
        />
      </Row>
      <Row label="Font">
        <div className="flex flex-col gap-1">
          <input
            list="font-family-options"
            value={object.fontFamily}
            onChange={(e) => set({ fontFamily: e.target.value })}
            style={{ fontFamily: object.fontFamily }}
            className="w-full rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
          />
          <datalist id="font-family-options">
            {families.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          {localFonts.supported && localFonts.status !== 'loaded' && (
            <button
              type="button"
              onClick={() => void localFonts.load()}
              disabled={localFonts.status === 'loading'}
              className="self-start rounded bg-panel-2 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-panel-3 hover:text-zinc-100 disabled:opacity-40"
            >
              {localFonts.status === 'loading'
                ? 'Loading fonts…'
                : localFonts.status === 'denied'
                  ? 'Font access denied — retry'
                  : 'List all installed fonts'}
            </button>
          )}
          {localFonts.status === 'loaded' && (
            <span className="text-[10px] text-zinc-500">
              {localFonts.fonts.length} installed fonts available
            </span>
          )}
        </div>
      </Row>
      <Row label="Size">
        <Num value={object.fontSize} onChange={(v) => set({ fontSize: Math.max(1, v) })} />
      </Row>
      <Row label="Weight">
        <Num value={object.fontWeight} onChange={(v) => set({ fontWeight: v })} />
      </Row>
      <Row label="Line height">
        <Num
          value={object.lineHeight}
          step={0.05}
          onChange={(v) => set({ lineHeight: Math.max(0.25, Math.min(5, v)) })}
        />
      </Row>
      <Row label="Spacing">
        <Num
          value={object.letterSpacing}
          onChange={(v) => set({ letterSpacing: Math.max(-50, Math.min(200, v)) })}
        />
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={object.color}
          onChange={(e) => set({ color: e.target.value })}
          className="h-6 w-12 cursor-pointer rounded border border-black/30 bg-transparent"
        />
      </Row>
      <Row label="Align">
        <select
          value={object.align}
          onChange={(e) => set({ align: e.target.value as TextObject['align'] })}
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

function CompactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-3 shrink-0 text-[11px] text-zinc-400">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function Num({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-full rounded bg-panel-2 px-1.5 py-1 text-zinc-200 outline-none"
    />
  );
}
