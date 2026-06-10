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

interface DragState {
  kind: 'layer' | 'object';
  /** id of the dragged thing */
  id: string;
  /** layerId of the dragged thing (for objects) */
  sourceLayerId?: string;
}

/** Drop target indicator: where the dragged item will be inserted. */
interface DropTarget {
  kind: 'layer' | 'object';
  /** for layer drops: the visual index in `orderedLayers` */
  layerDisplayIndex?: number;
  /** for object drops: the layer container + visual index within that layer */
  layerId?: string;
  objectDisplayIndex?: number;
  /** drop the object into this layer (top of its stack); highlights the row */
  intoLayer?: boolean;
}

/**
 * Tree of layers (containers) with their child drawables. Click a layer to
 * make it active; click an object to select it (auto-activates its layer).
 * Drag-reorder works within layers (objects) and across the layer list;
 * dragging an object onto a layer row moves it into that layer.
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

  const [drag, setDrag] = useState<DragState | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const onDragStartLayer = (e: React.DragEvent, id: string) => {
    setDrag({ kind: 'layer', id });
    setDrop(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragStartObject = (e: React.DragEvent, layerId: string, objectId: string) => {
    setDrag({ kind: 'object', id: objectId, sourceLayerId: layerId });
    setDrop(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', objectId);
  };

  /**
   * Layer drag over an entire layer block (row + its object list), so a layer
   * can be dropped while hovering anywhere in the block — not just the row.
   */
  const onDragOverLayerBlock = (e: React.DragEvent, displayIndex: number) => {
    if (!drag || drag.kind !== 'layer') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertAt = e.clientY < r.top + r.height / 2 ? displayIndex : displayIndex + 1;
    const dragIdx = orderedLayers.findIndex((l) => l.id === drag.id);
    // Dropping a layer right next to itself is a no-op — show no indicator.
    if (insertAt === dragIdx || insertAt === dragIdx + 1) setDrop(null);
    else setDrop({ kind: 'layer', layerDisplayIndex: insertAt });
  };

  /** Object drag over a layer row: move it into that layer (top of stack). */
  const onDragOverLayerRow = (e: React.DragEvent, layerId: string) => {
    if (!drag || drag.kind !== 'object') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDrop({ kind: 'object', layerId, objectDisplayIndex: 0, intoLayer: true });
  };

  const onDragOverObjectRow = (e: React.DragEvent, layerId: string, displayIndex: number) => {
    if (!drag || drag.kind !== 'object') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertAt = e.clientY < r.top + r.height / 2 ? displayIndex : displayIndex + 1;
    if (drag.sourceLayerId === layerId) {
      const src = layers.find((l) => l.id === layerId);
      const storeIdx = src ? src.objects.findIndex((o) => o.id === drag.id) : -1;
      if (src && storeIdx >= 0) {
        const dragIdx = src.objects.length - 1 - storeIdx;
        // Dropping right next to itself is a no-op — show no indicator.
        if (insertAt === dragIdx || insertAt === dragIdx + 1) {
          setDrop(null);
          return;
        }
      }
    }
    setDrop({ kind: 'object', layerId, objectDisplayIndex: insertAt });
  };

  const onDragOverLayerBody = (e: React.DragEvent, layerId: string) => {
    // Allow dropping an object onto an empty layer body.
    if (!drag || drag.kind !== 'object') return;
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.objects.length > 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDrop({ kind: 'object', layerId, objectDisplayIndex: 0 });
  };

  /**
   * Fallback for everywhere else in the panel (gaps between rows, the drop
   * indicator itself, header/footer). HTML5 DnD cancels the drag unless
   * dragover is preventDefault-ed wherever the pointer is when released —
   * without this, drops over dead zones silently did nothing. For layer drags,
   * hovering above/below the list explicitly targets the top/bottom of the
   * stack; within the list the last row-computed target is kept.
   */
  const onDragOverPanel = (e: React.DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const list = listRef.current;
    if (drag.kind !== 'layer' || !list) return;
    const r = list.getBoundingClientRect();
    const insertAt = e.clientY >= r.bottom ? orderedLayers.length : e.clientY <= r.top ? 0 : null;
    if (insertAt == null) return;
    const dragIdx = orderedLayers.findIndex((l) => l.id === drag.id);
    if (insertAt === dragIdx || insertAt === dragIdx + 1) setDrop(null);
    else setDrop({ kind: 'layer', layerDisplayIndex: insertAt });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (drag && drop) {
      if (drag.kind === 'layer' && drop.kind === 'layer' && drop.layerDisplayIndex != null) {
        // Convert visual index in the displayed (top-down) order back to the
        // underlying bottom-up storage order.
        moveLayerToIndex(drag.id, layers.length - drop.layerDisplayIndex);
      } else if (drag.kind === 'object' && drop.kind === 'object' && drop.layerId) {
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
    }
    setDrag(null);
    setDrop(null);
  };
  const onDragEnd = () => {
    setDrag(null);
    setDrop(null);
  };

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={onDragOverPanel}
      onDragEnter={onDragOverPanel}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <SelectionControls />
      <div ref={listRef} className="flex flex-col">
        {orderedLayers.length === 0 ? (
          <div className="px-1 py-2 text-zinc-500">
            No layers yet. Add one below — or add a drawable to auto-create one.
          </div>
        ) : (
          orderedLayers.map((l, i) => (
            <div
              key={l.id}
              onDragOver={(e) => onDragOverLayerBlock(e, i)}
              onDragEnter={(e) => onDragOverLayerBlock(e, i)}
            >
              {drop?.kind === 'layer' && drop.layerDisplayIndex === i && <DropIndicator />}
              <LayerRow
                layer={l}
                isActive={selectedLayerId === l.id}
                isCollapsed={collapsed.has(l.id)}
                isDragging={drag?.kind === 'layer' && drag.id === l.id}
                isDropInto={!!drop?.intoLayer && drop.layerId === l.id}
                onToggleCollapsed={() => toggleCollapsed(l.id)}
                onSelect={() => selectLayer(l.id)}
                onToggleVisible={() => updateLayer(l.id, { visible: !l.visible })}
                onToggleLock={() => updateLayer(l.id, { locked: !l.locked })}
                onRename={(name) => updateLayer(l.id, { name })}
                onDuplicate={() => duplicateLayer(l.id)}
                onDelete={() => removeLayer(l.id)}
                onDragStart={(e) => onDragStartLayer(e, l.id)}
                onDragOver={(e) => onDragOverLayerRow(e, l.id)}
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
      <div className="flex items-center justify-between border-t border-black/30 pt-1.5">
        <span className="px-1 text-[10px] text-zinc-500">
          {layers.length} {layers.length === 1 ? 'layer' : 'layers'}
        </span>
        <button
          type="button"
          onClick={() => addLayer()}
          title="New layer"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-zinc-300 hover:bg-panel-3 hover:text-zinc-100"
        >
          <PlusIcon />
          Layer
        </button>
      </div>
    </div>
  );
}

/**
 * Blend mode + opacity for the current selection (object if one is selected,
 * else the active layer), Photoshop-style — keeps the rows themselves compact.
 */
function SelectionControls() {
  const layers = useEditor((s) => s.doc.layers);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const selectedObjectId = useEditor((s) => s.selectedObjectId);
  const updateLayer = useEditor((s) => s.updateLayer);
  const updateObject = useEditor((s) => s.updateObject);

  let target: Layer | LayerObject | null = null;
  let isObject = false;
  if (selectedObjectId) {
    for (const l of layers) {
      const o = l.objects.find((x) => x.id === selectedObjectId);
      if (o) {
        target = o;
        isObject = true;
        break;
      }
    }
  }
  if (!target && selectedLayerId) {
    target = layers.find((l) => l.id === selectedLayerId) ?? null;
  }

  const apply = (patch: { opacity?: number; blendMode?: BlendMode }) => {
    if (!target) return;
    if (isObject) updateObject(target.id, patch);
    else updateLayer(target.id, patch);
  };

  return (
    <div className="flex flex-col gap-1 rounded bg-panel-2/60 p-1.5">
      <div className="truncate px-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
        {target ? `${isObject ? 'Object' : 'Layer'} — ${target.name}` : 'No selection'}
      </div>
      <div className="flex items-center gap-1.5">
        <select
          value={target?.blendMode ?? 'normal'}
          disabled={!target}
          onChange={(e) => apply({ blendMode: e.target.value as BlendMode })}
          className="rounded bg-panel px-1 py-0.5 text-zinc-300 outline-none hover:bg-panel-3 disabled:opacity-40"
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
          max={100}
          step={1}
          disabled={!target}
          value={target ? Math.round(target.opacity * 100) : 100}
          onChange={(e) => apply({ opacity: Number(e.target.value) / 100 })}
          className="min-w-0 flex-1 disabled:opacity-40"
          title="Opacity"
        />
        {target ? (
          <OpacityField value={target.opacity} onChange={(v) => apply({ opacity: v })} />
        ) : (
          <span className="w-12 px-1 py-0.5 text-right text-zinc-600">–</span>
        )}
      </div>
    </div>
  );
}

function ObjectList(props: {
  layer: Layer;
  selectedObjectId: string | null;
  additionalSelectedObjectIds: string[];
  drop: DropTarget | null;
  drag: DragState | null;
  onDragOverLayerBody: (e: React.DragEvent) => void;
  onObjectDragStart: (e: React.DragEvent, objectId: string) => void;
  onObjectDragOver: (e: React.DragEvent, displayIndex: number) => void;
  onObjectClick: (objectId: string) => void;
  onObjectToggleVisible: (objectId: string, visible: boolean) => void;
  onObjectToggleLock: (objectId: string, locked: boolean) => void;
  onObjectRename: (objectId: string, name: string) => void;
  onObjectDuplicate: (objectId: string) => void;
  onObjectDelete: (objectId: string) => void;
}) {
  const { layer, drop } = props;
  const orderedObjects = [...layer.objects].reverse();
  const dropHere = (i: number) =>
    drop?.kind === 'object' &&
    !drop.intoLayer &&
    drop.layerId === layer.id &&
    drop.objectDisplayIndex === i;

  return (
    <div
      className="ml-3 flex flex-col gap-px border-l border-black/30 pl-1.5"
      onDragOver={props.onDragOverLayerBody}
      onDragEnter={props.onDragOverLayerBody}
    >
      {orderedObjects.length === 0 ? (
        <div className="py-1 pl-1 text-[11px] italic text-zinc-600">empty</div>
      ) : (
        orderedObjects.map((o, i) => (
          <div key={o.id}>
            {dropHere(i) && <DropIndicator />}
            <ObjectRow
              object={o}
              isPrimary={props.selectedObjectId === o.id}
              isAdditional={props.additionalSelectedObjectIds.includes(o.id)}
              isDragging={props.drag?.kind === 'object' && props.drag.id === o.id}
              onSelect={() => props.onObjectClick(o.id)}
              onToggleVisible={() => props.onObjectToggleVisible(o.id, !o.visible)}
              onToggleLock={() => props.onObjectToggleLock(o.id, !o.locked)}
              onRename={(name) => props.onObjectRename(o.id, name)}
              onDuplicate={() => props.onObjectDuplicate(o.id)}
              onDelete={() => props.onObjectDelete(o.id)}
              onDragStart={(e) => props.onObjectDragStart(e, o.id)}
              onDragOver={(e) => props.onObjectDragOver(e, i)}
            />
          </div>
        ))
      )}
      {dropHere(orderedObjects.length) && <DropIndicator />}
    </div>
  );
}

function DropIndicator() {
  return (
    <div className="relative my-px h-0.5 rounded bg-accent">
      <div className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full border-2 border-accent bg-panel" />
    </div>
  );
}

function LayerRow(props: {
  layer: Layer;
  isActive: boolean;
  isCollapsed: boolean;
  isDragging: boolean;
  isDropInto: boolean;
  onToggleCollapsed: () => void;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  const { layer, isActive, isDragging, isCollapsed, isDropInto } = props;
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
      onDragEnter={props.onDragOver}
      onClick={props.onSelect}
      title="Click to select · drag to reorder"
      className={`group flex h-7 select-none items-center gap-0.5 rounded border px-1 ${
        isActive ? 'border-accent bg-panel-3' : 'border-transparent bg-panel-2/60 hover:bg-panel-3'
      } ${isDropInto ? 'ring-1 ring-inset ring-accent' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <IconButton
        title={isCollapsed ? 'Expand' : 'Collapse'}
        onClick={props.onToggleCollapsed}
        className="text-zinc-500 hover:text-zinc-200"
      >
        <ChevronIcon open={!isCollapsed} />
      </IconButton>
      <IconButton
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        onClick={props.onToggleVisible}
        className={
          layer.visible ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600 hover:text-zinc-300'
        }
      >
        {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
      <div className={`min-w-0 flex-1 px-0.5 ${layer.visible ? '' : 'opacity-50'}`}>
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
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            className="truncate text-zinc-200"
            title="Double-click to rename"
          >
            {layer.name}
            <span className="ml-1 text-[10px] text-zinc-500">{layer.objects.length}</span>
          </div>
        )}
      </div>
      <IconButton
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
        onClick={props.onToggleLock}
        className={
          layer.locked
            ? 'text-amber-400 hover:text-amber-300'
            : 'text-zinc-500 opacity-0 hover:text-zinc-200 group-hover:opacity-100'
        }
      >
        {layer.locked ? <LockIcon /> : <UnlockIcon />}
      </IconButton>
      <IconButton
        title="Duplicate layer"
        onClick={props.onDuplicate}
        className="text-zinc-400 opacity-0 hover:text-zinc-200 group-hover:opacity-100"
      >
        <CopyIcon />
      </IconButton>
      <IconButton
        title="Delete layer"
        onClick={props.onDelete}
        className="text-red-400 opacity-0 hover:text-red-300 group-hover:opacity-100"
      >
        <TrashIcon />
      </IconButton>
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
      onDragEnter={props.onDragOver}
      onClick={(e) => {
        e.stopPropagation();
        props.onSelect();
      }}
      title="Click to select · drag to reorder or move between layers"
      className={`group flex h-8 select-none items-center gap-1 rounded border px-1 ${
        isPrimary
          ? 'border-accent bg-panel-3'
          : isAdditional
            ? 'border-accent/60 bg-panel-3/60'
            : 'border-transparent bg-panel-2/40 hover:bg-panel-3'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <IconButton
        title={object.visible ? 'Hide' : 'Show'}
        onClick={props.onToggleVisible}
        className={
          object.visible ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600 hover:text-zinc-300'
        }
      >
        {object.visible ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
      <ObjectThumb object={object} dim={!object.visible} />
      <div className={`min-w-0 flex-1 px-0.5 ${object.visible ? '' : 'opacity-50'}`}>
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
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            className="truncate text-zinc-200"
            title="Double-click to rename"
          >
            {object.name}
          </div>
        )}
      </div>
      <IconButton
        title={object.locked ? 'Unlock' : 'Lock'}
        onClick={props.onToggleLock}
        className={
          object.locked
            ? 'text-amber-400 hover:text-amber-300'
            : 'text-zinc-500 opacity-0 hover:text-zinc-200 group-hover:opacity-100'
        }
      >
        {object.locked ? <LockIcon /> : <UnlockIcon />}
      </IconButton>
      <IconButton
        title="Duplicate"
        onClick={props.onDuplicate}
        className="text-zinc-400 opacity-0 hover:text-zinc-200 group-hover:opacity-100"
      >
        <CopyIcon />
      </IconButton>
      <IconButton
        title="Delete"
        onClick={props.onDelete}
        className="text-red-400 opacity-0 hover:text-red-300 group-hover:opacity-100"
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}

function ObjectThumb({ object, dim }: { object: LayerObject; dim?: boolean }) {
  const box = `grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded border border-black/40 bg-panel/80 ${
    dim ? 'opacity-50' : ''
  }`;
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

/* ---------------------------------- icons --------------------------------- */

function IconButton(props: {
  title: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      className={`grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-black/30 ${
        props.className ?? ''
      }`}
    >
      {props.children}
    </button>
  );
}

function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-3.5 w-3.5'}
    >
      {children}
    </svg>
  );
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <Svg className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </Svg>
);

const EyeIcon = () => (
  <Svg>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);

const EyeOffIcon = () => (
  <Svg>
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <path d="M3 13L13 3" />
  </Svg>
);

const LockIcon = () => (
  <Svg>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
);

const UnlockIcon = () => (
  <Svg>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" />
  </Svg>
);

const CopyIcon = () => (
  <Svg>
    <rect x="6" y="6" width="7.5" height="7.5" rx="1" />
    <path d="M3.5 10V3.5a1 1 0 0 1 1-1H11" />
  </Svg>
);

const TrashIcon = () => (
  <Svg>
    <path d="M2.5 4.5h11" />
    <path d="M5.5 4.5v-1a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
    <path d="M4 4.5l.7 8a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8" />
  </Svg>
);

const PlusIcon = () => (
  <Svg>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
