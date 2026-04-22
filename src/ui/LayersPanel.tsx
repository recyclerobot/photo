import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../editor/store';
import { importImageFiles } from '../editor/export';
import type {
  BlendMode,
  ImageLayer,
  Layer,
  ShapeLayer,
  ShapeKind,
  TextLayer,
} from '../editor/types';

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
  const duplicate = useEditor((s) => s.duplicateLayer);
  const moveToIndex = useEditor((s) => s.moveLayerToIndex);
  const addText = useEditor((s) => s.addTextLayer);
  const addEmpty = useEditor((s) => s.addEmptyLayer);
  const addShape = useEditor((s) => s.addShapeLayer);

  const ordered = [...layers].reverse();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBeforeIndex, setDropBeforeIndex] = useState<number | null>(null);

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOverRow = (e: React.DragEvent, displayIndex: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    setDropBeforeIndex(before ? displayIndex : displayIndex + 1);
  };
  const onDrop = () => {
    if (dragId == null || dropBeforeIndex == null) {
      setDragId(null);
      setDropBeforeIndex(null);
      return;
    }
    const len = layers.length;
    const targetStoreIndex = len - dropBeforeIndex;
    moveToIndex(dragId, targetStoreIndex);
    setDragId(null);
    setDropBeforeIndex(null);
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropBeforeIndex(null);
  };

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
      <div className="flex flex-col" onDrop={onDrop} onDragEnd={onDragEnd}>
        {ordered.length === 0 ? (
          <div className="px-1 py-2 text-zinc-500">
            No layers yet. Use the buttons below to add one.
          </div>
        ) : (
          ordered.map((l, i) => (
            <div key={l.id}>
              {dropBeforeIndex === i && <DropIndicator />}
              <Row
                layer={l}
                isSelected={selected === l.id}
                isDragging={dragId === l.id}
                onSelect={() => select(l.id)}
                onToggleVisible={() => update(l.id, { visible: !l.visible } as Partial<Layer>)}
                onToggleLock={() => update(l.id, { locked: !l.locked } as Partial<Layer>)}
                onRename={(name) => update(l.id, { name } as Partial<Layer>)}
                onOpacity={(v) => update(l.id, { opacity: v } as Partial<Layer>)}
                onBlend={(b) => update(l.id, { blendMode: b } as Partial<Layer>)}
                onDuplicate={() => duplicate(l.id)}
                onDelete={() => remove(l.id)}
                onDragStart={(e) => onDragStart(e, l.id)}
                onDragOver={(e) => onDragOverRow(e, i)}
              />
            </div>
          ))
        )}
        {dropBeforeIndex === ordered.length && <DropIndicator />}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-black/30 pt-2">
        <AddBtn title="New empty layer" onClick={() => addEmpty()}>
          ＋ Empty
        </AddBtn>
        <AddBtn title="New text layer (T)" onClick={() => addText()}>
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

function DropIndicator() {
  return <div className="my-0.5 h-0.5 rounded bg-accent" />;
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
  isDragging: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onRename: (name: string) => void;
  onOpacity: (v: number) => void;
  onBlend: (b: BlendMode) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  const { layer, isSelected, isDragging } = props;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) {
      setDraft(layer.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [renaming, layer.name]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== layer.name) props.onRename(v);
    setRenaming(false);
  };

  return (
    <div
      draggable={!renaming}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onClick={props.onSelect}
      className={`group flex items-center gap-1.5 rounded border p-1 ${
        isSelected
          ? 'border-accent bg-panel-3'
          : 'border-transparent bg-panel-2/60 hover:bg-panel-3'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span
        className="cursor-grab select-none px-0.5 text-zinc-500 hover:text-zinc-300"
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <Thumb layer={layer} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleVisible();
        }}
        className="grid h-5 w-5 place-items-center rounded text-[11px] hover:bg-panel-3"
        title={layer.visible ? 'Hide' : 'Show'}
      >
        {layer.visible ? '👁' : '–'}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleLock();
        }}
        className="grid h-5 w-5 place-items-center rounded text-[11px] hover:bg-panel-3"
        title={layer.locked ? 'Unlock' : 'Lock'}
      >
        {layer.locked ? '🔒' : '🔓'}
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') setRenaming(false);
            }}
            className="w-full rounded bg-panel px-1 text-zinc-200 outline-none"
          />
        ) : (
          <button
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            className="w-full truncate text-left text-zinc-200"
            title="Double-click to rename"
          >
            {layer.name}
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <select
            value={layer.blendMode}
            onChange={(e) => props.onBlend(e.target.value as BlendMode)}
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-transparent px-0.5 text-zinc-400 outline-none hover:bg-panel-3"
            title="Blend mode"
          >
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(e) => props.onOpacity(parseFloat(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="h-1 flex-1 accent-accent"
            title={`Opacity ${Math.round(layer.opacity * 100)}%`}
          />
          <span className="w-7 text-right tabular-nums">{Math.round(layer.opacity * 100)}%</span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onDuplicate();
        }}
        className="px-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-zinc-200"
        title="Duplicate"
      >
        ⎘
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
        className="px-1 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

function Thumb({ layer }: { layer: Layer }) {
  const box =
    'grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded border border-black/40 bg-panel/80';
  if (layer.type === 'image') {
    const img = layer as ImageLayer;
    return (
      <div className={box}>
        <img src={img.src} alt="" className="h-full w-full object-contain" draggable={false} />
      </div>
    );
  }
  if (layer.type === 'text') {
    const t = layer as TextLayer;
    return (
      <div className={box} style={{ color: t.color }}>
        <span style={{ fontFamily: t.fontFamily, fontWeight: t.fontWeight, fontSize: 14 }}>T</span>
      </div>
    );
  }
  const s = layer as ShapeLayer;
  const fill = s.fillColor ?? 'transparent';
  const stroke = s.strokeColor ?? 'transparent';
  const sw = Math.min(2, s.strokeWidth || 0);
  return (
    <div className={box}>
      <svg viewBox="0 0 20 20" className="h-full w-full">
        {s.shape === 'rectangle' && (
          <rect
            x={2}
            y={2}
            width={16}
            height={16}
            rx={Math.min(8, (s.cornerRadius || 0) / 4)}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
          />
        )}
        {s.shape === 'ellipse' && (
          <ellipse cx={10} cy={10} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={sw} />
        )}
        {s.shape === 'triangle' && (
          <polygon points="10,2 18,18 2,18" fill={fill} stroke={stroke} strokeWidth={sw} />
        )}
        {s.shape === 'line' && (
          <line
            x1={2}
            y1={18}
            x2={18}
            y2={2}
            stroke={s.strokeColor ?? s.fillColor ?? '#ccc'}
            strokeWidth={Math.max(1, sw)}
          />
        )}
        {s.shape === 'empty' && (
          <rect
            x={2}
            y={2}
            width={16}
            height={16}
            rx={2}
            fill="none"
            stroke="#666"
            strokeDasharray="2 2"
          />
        )}
      </svg>
    </div>
  );
}
