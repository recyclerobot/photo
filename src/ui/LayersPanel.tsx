import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../editor/store';
import type {
  BlendMode,
  ImageObject,
  Layer,
  LayerObject,
  ShapeObject,
  TextObject,
} from '../editor/types';

const BLENDS: BlendMode[] = ['normal', 'add', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

/**
 * Tree of layers (containers) with their child drawables. Click a layer to
 * make it active; click an object to select it (auto-activates its layer).
 * Drag-reorder works within layers (objects) and across the layer list.
 */
export function LayersPanel() {
  const layers = useEditor((s) => s.doc.layers);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const selectedObjectId = useEditor((s) => s.selectedObjectId);
  const additionalSelectedObjectIds = useEditor((s) => s.additionalSelectedObjectIds);
  const selectLayer = useEditor((s) => s.selectLayer);
  const selectObject = useEditor((s) => s.selectObject);
  const updateLayer = useEditor((s) => s.updateLayer);
  const updateObject = useEditor((s) => s.updateObject);
  const removeLayer = useEditor((s) => s.removeLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const moveLayerToIndex = useEditor((s) => s.moveLayerToIndex);
  const moveObjectToIndex = useEditor((s) => s.moveObjectToIndex);
  const moveObjectToLayer = useEditor((s) => s.moveObjectToLayer);
  const removeObject = useEditor((s) => s.removeObject);
  const duplicateObject = useEditor((s) => s.duplicateObject);
  const addLayer = useEditor((s) => s.addLayer);

  const orderedLayers = [...layers].reverse();

  // Per-layer collapsed state (default expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Drag state: we track what kind of thing is being dragged + a target hint.
  interface DragState {
    kind: 'layer' | 'object';
    /** id of the dragged thing */
    id: string;
    /** layerId of the dragged thing (for objects) */
    sourceLayerId?: string;
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  /** drop target indicator: where the dragged item will be inserted. */
  interface DropTarget {
    kind: 'layer' | 'object';
    /** for layer drops: the visual index in `orderedLayers` */
    layerDisplayIndex?: number;
    /** for object drops: the layer container + visual index within that layer */
    layerId?: string;
    objectDisplayIndex?: number;
  }
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const onDragStartLayer = (e: React.DragEvent, id: string) => {
    setDrag({ kind: 'layer', id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOverLayerRow = (e: React.DragEvent, displayIndex: number) => {
    if (!drag || drag.kind !== 'layer') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    setDrop({
      kind: 'layer',
      layerDisplayIndex: before ? displayIndex : displayIndex + 1,
    });
  };
  const onDragStartObject = (e: React.DragEvent, layerId: string, objectId: string) => {
    setDrag({ kind: 'object', id: objectId, sourceLayerId: layerId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', objectId);
  };
  const onDragOverObjectRow = (e: React.DragEvent, layerId: string, displayIndex: number) => {
    if (!drag || drag.kind !== 'object') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    setDrop({
      kind: 'object',
      layerId,
      objectDisplayIndex: before ? displayIndex : displayIndex + 1,
    });
  };
  const onDragOverLayerBody = (e: React.DragEvent, layerId: string) => {
    // Allow dropping an object onto an empty layer body.
    if (!drag || drag.kind !== 'object') return;
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.objects.length > 0) return;
    e.preventDefault();
    setDrop({ kind: 'object', layerId, objectDisplayIndex: 0 });
  };
  const onDrop = () => {
    if (!drag || !drop) {
      setDrag(null);
      setDrop(null);
      return;
    }
    if (drag.kind === 'layer' && drop.kind === 'layer' && drop.layerDisplayIndex != null) {
      const targetStoreIndex = layers.length - drop.layerDisplayIndex;
      moveLayerToIndex(drag.id, targetStoreIndex);
    } else if (drag.kind === 'object' && drop.kind === 'object' && drop.layerId) {
      // Convert visual index in the displayed (top-down) order back to the
      // underlying bottom-up storage order.
      const targetLayer = layers.find((l) => l.id === drop.layerId);
      if (targetLayer) {
        const targetStoreIndex = targetLayer.objects.length - (drop.objectDisplayIndex ?? 0);
        if (drag.sourceLayerId === drop.layerId) {
          moveObjectToIndex(drag.id, targetStoreIndex);
        } else {
          moveObjectToLayer(drag.id, drop.layerId, targetStoreIndex);
        }
      }
    }
    setDrag(null);
    setDrop(null);
  };
  const onDragEnd = () => {
    setDrag(null);
    setDrop(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col" onDrop={onDrop} onDragEnd={onDragEnd}>
        {orderedLayers.length === 0 ? (
          <div className="px-1 py-2 text-zinc-500">
            No layers yet. Add one below — or add a drawable to auto-create one.
          </div>
        ) : (
          orderedLayers.map((l, i) => (
            <div key={l.id}>
              {drop?.kind === 'layer' && drop.layerDisplayIndex === i && <DropIndicator />}
              <LayerRow
                layer={l}
                isActive={selectedLayerId === l.id}
                isCollapsed={collapsed.has(l.id)}
                isDragging={drag?.kind === 'layer' && drag.id === l.id}
                onToggleCollapsed={() => toggleCollapsed(l.id)}
                onSelect={() => selectLayer(l.id)}
                onToggleVisible={() => updateLayer(l.id, { visible: !l.visible })}
                onToggleLock={() => updateLayer(l.id, { locked: !l.locked })}
                onRename={(name) => updateLayer(l.id, { name })}
                onOpacity={(v) => updateLayer(l.id, { opacity: v })}
                onBlend={(b) => updateLayer(l.id, { blendMode: b })}
                onDuplicate={() => duplicateLayer(l.id)}
                onDelete={() => removeLayer(l.id)}
                onDragStart={(e) => onDragStartLayer(e, l.id)}
                onDragOver={(e) => onDragOverLayerRow(e, i)}
              />

              {!collapsed.has(l.id) && (
                <ObjectList
                  layer={l}
                  selectedObjectId={selectedObjectId}
                  additionalSelectedObjectIds={additionalSelectedObjectIds}
                  drop={drop}
                  drag={drag}
                  onDragOverLayerBody={(e) => onDragOverLayerBody(e, l.id)}
                  onObjectDragStart={(e, oid) => onDragStartObject(e, l.id, oid)}
                  onObjectDragOver={(e, idx) => onDragOverObjectRow(e, l.id, idx)}
                  onObjectClick={(oid) => selectObject(oid)}
                  onObjectToggleVisible={(oid, vis) => updateObject(oid, { visible: vis })}
                  onObjectToggleLock={(oid, locked) => updateObject(oid, { locked })}
                  onObjectRename={(oid, name) => updateObject(oid, { name })}
                  onObjectOpacity={(oid, v) => updateObject(oid, { opacity: v })}
                  onObjectBlend={(oid, b) => updateObject(oid, { blendMode: b })}
                  onObjectDuplicate={(oid) => duplicateObject(oid)}
                  onObjectDelete={(oid) => removeObject(oid)}
                />
              )}
            </div>
          ))
        )}
        {drop?.kind === 'layer' && drop.layerDisplayIndex === orderedLayers.length && (
          <DropIndicator />
        )}
      </div>
      <div className="flex justify-end border-t border-black/30 pt-2">
        <button
          type="button"
          onClick={() => addLayer()}
          title="New layer"
          className="grid h-6 w-6 place-items-center rounded text-zinc-300 hover:bg-panel-3 hover:text-zinc-100"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ObjectList(props: {
  layer: Layer;
  selectedObjectId: string | null;
  additionalSelectedObjectIds: string[];
  drop: {
    kind: 'layer' | 'object';
    layerDisplayIndex?: number;
    layerId?: string;
    objectDisplayIndex?: number;
  } | null;
  drag: { kind: 'layer' | 'object'; id: string; sourceLayerId?: string } | null;
  onDragOverLayerBody: (e: React.DragEvent) => void;
  onObjectDragStart: (e: React.DragEvent, objectId: string) => void;
  onObjectDragOver: (e: React.DragEvent, displayIndex: number) => void;
  onObjectClick: (objectId: string) => void;
  onObjectToggleVisible: (objectId: string, visible: boolean) => void;
  onObjectToggleLock: (objectId: string, locked: boolean) => void;
  onObjectRename: (objectId: string, name: string) => void;
  onObjectOpacity: (objectId: string, value: number) => void;
  onObjectBlend: (objectId: string, blend: BlendMode) => void;
  onObjectDuplicate: (objectId: string) => void;
  onObjectDelete: (objectId: string) => void;
}) {
  const { layer, drop } = props;
  const orderedObjects = [...layer.objects].reverse();

  return (
    <div
      className="ml-4 flex flex-col gap-px border-l border-black/30 pl-2"
      onDragOver={props.onDragOverLayerBody}
    >
      {orderedObjects.length === 0 ? (
        <div className="py-1 text-[11px] italic text-zinc-500">empty</div>
      ) : (
        orderedObjects.map((o, i) => (
          <div key={o.id}>
            {drop?.kind === 'object' &&
              drop.layerId === layer.id &&
              drop.objectDisplayIndex === i && <DropIndicator small />}
            <ObjectRow
              object={o}
              isPrimary={props.selectedObjectId === o.id}
              isAdditional={props.additionalSelectedObjectIds.includes(o.id)}
              isDragging={props.drag?.kind === 'object' && props.drag.id === o.id}
              onSelect={() => props.onObjectClick(o.id)}
              onToggleVisible={() => props.onObjectToggleVisible(o.id, !o.visible)}
              onToggleLock={() => props.onObjectToggleLock(o.id, !o.locked)}
              onRename={(name) => props.onObjectRename(o.id, name)}
              onOpacity={(v) => props.onObjectOpacity(o.id, v)}
              onBlend={(b) => props.onObjectBlend(o.id, b)}
              onDuplicate={() => props.onObjectDuplicate(o.id)}
              onDelete={() => props.onObjectDelete(o.id)}
              onDragStart={(e) => props.onObjectDragStart(e, o.id)}
              onDragOver={(e) => props.onObjectDragOver(e, i)}
            />
          </div>
        ))
      )}
      {drop?.kind === 'object' &&
        drop.layerId === layer.id &&
        drop.objectDisplayIndex === orderedObjects.length && <DropIndicator small />}
    </div>
  );
}

function DropIndicator({ small }: { small?: boolean }) {
  return <div className={`my-0.5 ${small ? 'h-px' : 'h-0.5'} rounded bg-accent`} />;
}

function LayerRow(props: {
  layer: Layer;
  isActive: boolean;
  isCollapsed: boolean;
  isDragging: boolean;
  onToggleCollapsed: () => void;
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
  const { layer, isActive, isDragging, isCollapsed } = props;
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
        isActive ? 'border-accent bg-panel-3' : 'border-transparent bg-panel-2/60 hover:bg-panel-3'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleCollapsed();
        }}
        className="grid h-5 w-5 place-items-center rounded text-zinc-500 hover:bg-panel-3 hover:text-zinc-200"
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        {isCollapsed ? '▸' : '▾'}
      </button>
      <span
        className="cursor-grab select-none px-0.5 text-zinc-500 hover:text-zinc-300"
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleVisible();
        }}
        className="grid h-5 w-5 place-items-center rounded text-[11px] hover:bg-panel-3"
        title={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? '👁' : '–'}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleLock();
        }}
        className="grid h-5 w-5 place-items-center rounded text-[11px] hover:bg-panel-3"
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
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
            <span className="ml-1 text-[10px] text-zinc-500">({layer.objects.length})</span>
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <select
            value={layer.blendMode}
            onChange={(e) => props.onBlend(e.target.value as BlendMode)}
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-transparent px-0.5 text-zinc-400 outline-none hover:bg-panel-3"
            title="Layer blend mode"
          >
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <OpacityField value={layer.opacity} onChange={props.onOpacity} />
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onDuplicate();
        }}
        className="px-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-zinc-200"
        title="Duplicate layer"
      >
        ⎘
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete();
        }}
        className="px-1 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-300"
        title="Delete layer"
      >
        ✕
      </button>
    </div>
  );
}

function ObjectRow(props: {
  object: LayerObject;
  isPrimary: boolean;
  isAdditional: boolean;
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
  const { object, isPrimary, isAdditional, isDragging } = props;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(object.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) {
      setDraft(object.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [renaming, object.name]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== object.name) props.onRename(v);
    setRenaming(false);
  };

  return (
    <div
      draggable={!renaming}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onClick={(e) => {
        e.stopPropagation();
        props.onSelect();
      }}
      className={`group flex items-center gap-1.5 rounded border p-1 ${
        isPrimary
          ? 'border-accent bg-panel-3'
          : isAdditional
            ? 'border-accent/60 bg-panel-3/60'
            : 'border-transparent bg-panel-2/40 hover:bg-panel-3'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span
        className="cursor-grab select-none px-0.5 text-zinc-500 hover:text-zinc-300"
        title="Drag to reorder or move between layers"
      >
        ⋮⋮
      </span>
      <ObjectThumb object={object} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleVisible();
        }}
        className="grid h-5 w-5 place-items-center rounded text-[11px] hover:bg-panel-3"
        title={object.visible ? 'Hide' : 'Show'}
      >
        {object.visible ? '👁' : '–'}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleLock();
        }}
        className="grid h-5 w-5 place-items-center rounded text-[11px] hover:bg-panel-3"
        title={object.locked ? 'Unlock' : 'Lock'}
      >
        {object.locked ? '🔒' : '🔓'}
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
            {object.name}
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <select
            value={object.blendMode}
            onChange={(e) => props.onBlend(e.target.value as BlendMode)}
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-transparent px-0.5 text-zinc-400 outline-none hover:bg-panel-3"
            title="Object blend mode"
          >
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <OpacityField value={object.opacity} onChange={props.onOpacity} />
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

function ObjectThumb({ object }: { object: LayerObject }) {
  const box =
    'grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded border border-black/40 bg-panel/80';
  if (object.type === 'image') {
    const img = object as ImageObject;
    return (
      <div className={box}>
        <img src={img.src} alt="" className="h-full w-full object-contain" draggable={false} />
      </div>
    );
  }
  if (object.type === 'text') {
    const t = object as TextObject;
    return (
      <div className={box} style={{ color: t.color }}>
        <span style={{ fontFamily: t.fontFamily, fontWeight: t.fontWeight, fontSize: 14 }}>T</span>
      </div>
    );
  }
  const s = object as ShapeObject;
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

/**
 * Click-to-edit opacity readout. Shows "NN%" and on click swaps to a numeric
 * input that accepts 0–100. Commits on Enter or blur, cancels on Escape.
 */
function OpacityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [editing]);

  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n)) {
      const clamped = Math.max(0, Math.min(100, n));
      onChange(clamped / 100);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        max={100}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={commit}
        className="w-12 rounded bg-panel-3 px-1 py-0.5 text-right tabular-nums text-zinc-100 outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(String(Math.round(value * 100)));
        setEditing(true);
      }}
      title="Click to edit opacity"
      className="w-12 rounded px-1 py-0.5 text-right tabular-nums text-zinc-300 hover:bg-panel-3"
    >
      {Math.round(value * 100)}%
    </button>
  );
}
