import { useEditor } from '../editor/store';
import { importImageFiles } from '../editor/export';
import type { BlendMode, Layer, ShapeKind } from '../editor/types';

const BLENDS: BlendMode[] = ['normal', 'add', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

const SHAPE_OPTIONS: { kind: ShapeKind; label: string }[] = [
  { kind: 'rectangle', label: 'Rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'line', label: 'Line' },
];

export function LayersPanel() {
  const layers = useEditor((s) => s.doc.layers);
  const selected = useEditor((s) => s.selectedLayerId);
  const select = useEditor((s) => s.selectLayer);
  const update = useEditor((s) => s.updateLayer);
  const remove = useEditor((s) => s.removeLayer);
  const reorder = useEditor((s) => s.reorderLayer);
  const addText = useEditor((s) => s.addTextLayer);
  const addEmpty = useEditor((s) => s.addEmptyLayer);
  const addShape = useEditor((s) => s.addShapeLayer);

  // Render top-most layer first.
  const ordered = [...layers].reverse();

  const onImportClick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.onchange = () => inp.files && importImageFiles(inp.files);
    inp.click();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {ordered.length === 0 ? (
          <div className="px-1 py-2 text-zinc-500">
            No layers yet. Use the buttons below to add one.
          </div>
        ) : (
          ordered.map((l) => (
            <Row
              key={l.id}
              layer={l}
              isSelected={selected === l.id}
              onSelect={() => select(l.id)}
              onToggleVisible={() => update(l.id, { visible: !l.visible } as Partial<Layer>)}
              onToggleLock={() => update(l.id, { locked: !l.locked } as Partial<Layer>)}
              onRename={(name) => update(l.id, { name } as Partial<Layer>)}
              onOpacity={(v) => update(l.id, { opacity: v } as Partial<Layer>)}
              onBlend={(b) => update(l.id, { blendMode: b } as Partial<Layer>)}
              onUp={() => reorder(l.id, 1)}
              onDown={() => reorder(l.id, -1)}
              onDelete={() => remove(l.id)}
            />
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-black/30 pt-2">
        <AddBtn title="New empty layer" onClick={() => addEmpty()}>
          ＋ Empty
        </AddBtn>
        <AddBtn title="New text layer" onClick={() => addText()}>
          ＋ Text
        </AddBtn>
        <AddBtn title="Import image" onClick={onImportClick}>
          ＋ Image
        </AddBtn>
        <select
          onChange={(e) => {
            const v = e.target.value as ShapeKind | '';
            if (v) addShape(v);
            e.target.value = '';
          }}
          defaultValue=""
          title="New shape"
          className="rounded bg-panel-2 px-2 py-1 text-zinc-200 outline-none hover:bg-panel-3"
        >
          <option value="" disabled>
            ＋ Shape
          </option>
          {SHAPE_OPTIONS.map((s) => (
            <option key={s.kind} value={s.kind}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AddBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded bg-panel-2 px-2 py-1 text-zinc-200 hover:bg-panel-3"
    >
      {children}
    </button>
  );
}

function Row(props: {
  layer: Layer;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onRename: (name: string) => void;
  onOpacity: (v: number) => void;
  onBlend: (b: BlendMode) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const { layer, isSelected } = props;
  return (
    <div
      onClick={props.onSelect}
      className={`flex flex-col gap-1 rounded border p-1.5 ${
        isSelected
          ? 'border-accent bg-panel-3'
          : 'border-transparent bg-panel-2/60 hover:bg-panel-3'
      }`}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleVisible();
          }}
          className="grid h-5 w-5 place-items-center rounded hover:bg-panel-3"
          title={layer.visible ? 'Hide' : 'Show'}
        >
          {layer.visible ? '👁' : '–'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleLock();
          }}
          className="grid h-5 w-5 place-items-center rounded hover:bg-panel-3"
          title={layer.locked ? 'Unlock' : 'Lock'}
        >
          {layer.locked ? '🔒' : '🔓'}
        </button>
        <input
          value={layer.name}
          onChange={(e) => props.onRename(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent px-1 text-zinc-200 outline-none focus:bg-panel"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onUp();
          }}
          className="px-1 hover:bg-panel-3"
          title="Bring forward"
        >
          ↑
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onDown();
          }}
          className="px-1 hover:bg-panel-3"
          title="Send back"
        >
          ↓
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete();
          }}
          className="px-1 text-red-400 hover:bg-panel-3"
          title="Delete"
        >
          ✕
        </button>
      </div>
      {isSelected && (
        <div className="flex items-center gap-2 px-1 pb-1 text-[11px] text-zinc-400">
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(e) => props.onOpacity(parseFloat(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="flex-1"
          />
          <select
            value={layer.blendMode}
            onChange={(e) => props.onBlend(e.target.value as BlendMode)}
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-panel-2 px-1 py-0.5 text-zinc-200 outline-none"
          >
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
