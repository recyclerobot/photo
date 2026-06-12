import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  CanvasDoc,
  Effect,
  EffectKind,
  Guide,
  ImageObject,
  Layer,
  LayerObject,
  ShapeKind,
  ShapeObject,
  TextObject,
  ViewState,
} from './types';
import { DEFAULT_DOC, clampCanvasDim } from './types';
import { defaultEffectFor } from './effects';
import { measureText } from './text';
import { migrateDoc } from './migration';

const uid = () => Math.random().toString(36).slice(2, 10);

interface HistoryEntry {
  doc: CanvasDoc;
}

interface EditorState {
  doc: CanvasDoc;
  view: ViewState;
  /** Active layer (the container objects are added to). */
  selectedLayerId: string | null;
  /** Primary selected drawable (or null). */
  selectedObjectId: string | null;
  /** Additional objects in the active layer for marquee multi-select. */
  additionalSelectedObjectIds: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];

  // doc
  setDoc: (doc: CanvasDoc, options?: { record?: boolean }) => void;
  newDoc: (widthPx: number, heightPx: number, backgroundColor: string | null) => void;
  setCanvasSize: (widthPx: number, heightPx: number) => void;
  setBackgroundColor: (color: string | null) => void;

  // layers (containers)
  addLayer: (name?: string) => string;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, delta: number) => void;
  moveLayerToIndex: (id: string, targetIndex: number) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  selectLayer: (id: string | null) => void;

  // objects (drawables within layers)
  addImageObject: (
    src: string,
    naturalWidth: number,
    naturalHeight: number,
    name?: string,
  ) => string;
  addTextObject: (text?: string) => string;
  addShapeObject: (shape: ShapeKind) => string;
  updateObject: (id: string, patch: Partial<LayerObject>) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  reorderObject: (id: string, delta: number) => void;
  /** Move object within its layer to an absolute index. */
  moveObjectToIndex: (id: string, targetIndex: number) => void;
  /** Move object across layers, optionally to a target index in the new layer. */
  moveObjectToLayer: (id: string, targetLayerId: string, targetIndex?: number) => void;

  selectObject: (id: string | null) => void;
  setObjectSelection: (primary: string | null, additional?: string[]) => void;
  toggleAdditionalObjectSelected: (id: string) => void;
  clearAdditionalObjectSelection: () => void;

  // effects (per object)
  addEffect: (objectId: string, kind: EffectKind) => void;
  updateEffect: (objectId: string, effectId: string, patch: Partial<Effect>) => void;
  removeEffect: (objectId: string, effectId: string) => void;

  // guides (per document)
  addGuide: (g: Guide) => void;
  updateGuide: (index: number, g: Guide) => void;
  removeGuide: (index: number) => void;
  clearGuides: () => void;

  // view
  setView: (patch: Partial<ViewState>) => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const HISTORY_MAX = 50;

/**
 * Text objects auto-size from their content; only these fields require a
 * re-measure. width/height are included so direct patches to them get
 * re-derived (text dimensions are never authoritative).
 */
const TEXT_METRIC_FIELDS = [
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'width',
  'height',
] as const;

const cloneEffect = (e: Effect): Effect => ({ ...e, params: { ...e.params } }) as Effect;

const cloneObject = (o: LayerObject): LayerObject =>
  ({ ...o, effects: o.effects.map(cloneEffect) }) as LayerObject;

const cloneLayer = (l: Layer): Layer => ({
  ...l,
  objects: l.objects.map(cloneObject),
});

const cloneDoc = (doc: CanvasDoc): CanvasDoc => ({
  widthPx: doc.widthPx,
  heightPx: doc.heightPx,
  backgroundColor: doc.backgroundColor,
  layers: doc.layers.map(cloneLayer),
  guides: (doc.guides ?? []).map((g) => ({ ...g })),
});

/** Find the layer containing an object id (returns layer index + object index). */
function findObject(
  doc: CanvasDoc,
  objectId: string,
): { layer: Layer; layerIndex: number; objectIndex: number } | null {
  for (let li = 0; li < doc.layers.length; li++) {
    const layer = doc.layers[li];
    const oi = layer.objects.findIndex((o) => o.id === objectId);
    if (oi >= 0) return { layer, layerIndex: li, objectIndex: oi };
  }
  return null;
}

function freshLayer(name: string): Layer {
  return {
    id: uid(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    objects: [],
  };
}

const baseObjectDefaults = (): Pick<
  LayerObject,
  'rotation' | 'opacity' | 'visible' | 'locked' | 'blendMode' | 'effects'
> => ({
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  blendMode: 'normal',
  effects: [],
});

/** Rapid same-key mutations within this window collapse into one undo step. */
const COALESCE_MS = 300;

export const useEditor = create<EditorState>()(
  subscribeWithSelector((set, get) => {
    let lastRecord: { key: string; at: number } | null = null;

    /**
     * Record an undo step, then apply `mutator`. When `coalesceKey` is given
     * and matches the previous record within COALESCE_MS, the existing history
     * entry is kept instead of pushing a new one — so slider drags, canvas
     * drags, and typing become one undo step per burst, not one per tick.
     */
    const recordAnd = (mutator: (doc: CanvasDoc) => CanvasDoc, coalesceKey?: string) => {
      const { doc, past } = get();
      const now = Date.now();
      if (
        coalesceKey &&
        lastRecord &&
        lastRecord.key === coalesceKey &&
        now - lastRecord.at < COALESCE_MS &&
        past.length > 0
      ) {
        lastRecord.at = now;
        set({ doc: mutator(cloneDoc(doc)), future: [] });
        return;
      }
      lastRecord = coalesceKey ? { key: coalesceKey, at: now } : null;
      const nextPast = [...past, { doc: cloneDoc(doc) }].slice(-HISTORY_MAX);
      set({ doc: mutator(cloneDoc(doc)), past: nextPast, future: [] });
    };

    /** Coalescing must never merge across an undo/redo or document switch. */
    const breakCoalescing = () => {
      lastRecord = null;
    };

    /**
     * Get the active layer; if none exists or none is selected, create a
     * new one and make it active. Returns the layer id.
     *
     * Note: this is intended to be called *before* a `recordAnd` mutation
     * so the new layer is part of the same history entry.
     */
    const ensureActiveLayerId = (mutator: (doc: CanvasDoc) => Layer): string => {
      const s = get();
      const existing = s.doc.layers.find((l) => l.id === s.selectedLayerId);
      if (existing) return existing.id;
      // Create one inline and select it (without recording — the caller will
      // wrap the full operation in a single recordAnd).
      const layer = mutator(s.doc);
      set({
        doc: { ...s.doc, layers: [...s.doc.layers, layer] },
        selectedLayerId: layer.id,
      });
      return layer.id;
    };

    return {
      doc: DEFAULT_DOC,
      view: { zoom: 1, panX: 0, panY: 0 },
      selectedLayerId: null,
      selectedObjectId: null,
      additionalSelectedObjectIds: [],
      past: [],
      future: [],

      setDoc: (doc, options) => {
        breakCoalescing();
        const safe: CanvasDoc = migrateDoc(doc);
        if (options?.record !== false) {
          const { past, doc: prev } = get();
          set({
            doc: safe,
            past: [...past, { doc: cloneDoc(prev) }].slice(-HISTORY_MAX),
            future: [],
            selectedLayerId: safe.layers[safe.layers.length - 1]?.id ?? null,
            selectedObjectId: null,
            additionalSelectedObjectIds: [],
          });
        } else {
          set({
            doc: safe,
            selectedLayerId: safe.layers[safe.layers.length - 1]?.id ?? null,
            selectedObjectId: null,
            additionalSelectedObjectIds: [],
          });
        }
      },

      newDoc: (widthPx, heightPx, backgroundColor) => {
        breakCoalescing();
        // revoke any object URLs
        get().doc.layers.forEach((l) =>
          l.objects.forEach((o) => {
            if (o.type === 'image' && o.src.startsWith('blob:')) URL.revokeObjectURL(o.src);
          }),
        );
        set({
          doc: {
            widthPx: clampCanvasDim(widthPx),
            heightPx: clampCanvasDim(heightPx),
            backgroundColor,
            layers: [],
            guides: [],
          },
          past: [],
          future: [],
          selectedLayerId: null,
          selectedObjectId: null,
          additionalSelectedObjectIds: [],
        });
      },

      setCanvasSize: (widthPx, heightPx) =>
        recordAnd((d) => ({
          ...d,
          widthPx: clampCanvasDim(widthPx),
          heightPx: clampCanvasDim(heightPx),
        })),

      setBackgroundColor: (color) => recordAnd((d) => ({ ...d, backgroundColor: color }), 'bg'),

      // ---------------- layer-container ops ----------------

      addLayer: (name) => {
        const layer = freshLayer(name ?? `Layer ${get().doc.layers.length + 1}`);
        recordAnd((d) => ({ ...d, layers: [...d.layers, layer] }));
        set({
          selectedLayerId: layer.id,
          selectedObjectId: null,
          additionalSelectedObjectIds: [],
        });
        return layer.id;
      },

      removeLayer: (id) => {
        const layer = get().doc.layers.find((l) => l.id === id);
        if (layer) {
          for (const o of layer.objects) {
            if (o.type === 'image' && o.src.startsWith('blob:')) URL.revokeObjectURL(o.src);
          }
        }
        recordAnd((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
        const s = get();
        const patch: Partial<EditorState> = {};
        if (s.selectedLayerId === id) {
          patch.selectedLayerId = s.doc.layers[s.doc.layers.length - 1]?.id ?? null;
          patch.selectedObjectId = null;
          patch.additionalSelectedObjectIds = [];
        }
        if (Object.keys(patch).length) set(patch);
      },

      duplicateLayer: (id) => {
        const src = get().doc.layers.find((l) => l.id === id);
        if (!src) return;
        const newId = uid();
        const copy: Layer = {
          ...cloneLayer(src),
          id: newId,
          name: `${src.name} copy`,
          objects: src.objects.map((o) => ({
            ...cloneObject(o),
            id: uid(),
            x: o.x + 24,
            y: o.y + 24,
          })),
        };
        recordAnd((d) => ({ ...d, layers: [...d.layers, copy] }));
        set({ selectedLayerId: newId, selectedObjectId: null, additionalSelectedObjectIds: [] });
      },

      reorderLayer: (id, delta) =>
        recordAnd((d) => {
          const idx = d.layers.findIndex((l) => l.id === id);
          if (idx < 0) return d;
          const next = [...d.layers];
          const target = Math.max(0, Math.min(next.length - 1, idx + delta));
          if (target === idx) return d;
          const [item] = next.splice(idx, 1);
          next.splice(target, 0, item);
          return { ...d, layers: next };
        }),

      moveLayerToIndex: (id, targetIndex) =>
        recordAnd((d) => {
          const idx = d.layers.findIndex((l) => l.id === id);
          if (idx < 0) return d;
          const next = [...d.layers];
          const [item] = next.splice(idx, 1);
          const t = Math.max(
            0,
            Math.min(next.length, targetIndex > idx ? targetIndex - 1 : targetIndex),
          );
          if (t === idx) return d;
          next.splice(t, 0, item);
          return { ...d, layers: next };
        }),

      updateLayer: (id, patch) =>
        recordAnd(
          (d) => ({
            ...d,
            layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
          }),
          `layer:${id}:${Object.keys(patch).sort().join('+')}`,
        ),

      selectLayer: (id) => {
        const s = get();
        // If switching layer, drop object selection that no longer belongs here.
        const sel = s.selectedObjectId;
        const layer = id ? s.doc.layers.find((l) => l.id === id) : null;
        const objIds = new Set(layer?.objects.map((o) => o.id) ?? []);
        set({
          selectedLayerId: id,
          selectedObjectId: sel && objIds.has(sel) ? sel : null,
          additionalSelectedObjectIds: s.additionalSelectedObjectIds.filter((x) => objIds.has(x)),
        });
      },

      // ---------------- object ops ----------------

      addImageObject: (src, naturalWidth, naturalHeight, name) => {
        const id = uid();
        const { doc } = get();
        const maxW = doc.widthPx * 0.8;
        const maxH = doc.heightPx * 0.8;
        const scale = Math.min(1, maxW / naturalWidth, maxH / naturalHeight);
        const w = naturalWidth * scale;
        const h = naturalHeight * scale;
        const obj: ImageObject = {
          ...baseObjectDefaults(),
          id,
          name: name ?? 'Image',
          type: 'image',
          src,
          naturalWidth,
          naturalHeight,
          x: (doc.widthPx - w) / 2,
          y: (doc.heightPx - h) / 2,
          width: w,
          height: h,
        };
        const layerId = ensureActiveLayerId(() => freshLayer('Layer 1'));
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === layerId ? { ...l, objects: [...l.objects, obj] } : l,
          ),
        }));
        set({ selectedObjectId: id, additionalSelectedObjectIds: [] });
        return id;
      },

      addTextObject: (text = 'Text') => {
        const id = uid();
        const { doc } = get();
        const fontFamily = 'Inter, system-ui, sans-serif';
        const fontSize = 64;
        const fontWeight = 600;
        const lineHeight = 1.25;
        const letterSpacing = 0;
        const measured = measureText(
          text,
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          letterSpacing,
        );
        const w = Math.max(20, measured.width);
        const h = Math.max(20, measured.height);
        const obj: TextObject = {
          ...baseObjectDefaults(),
          id,
          name: 'Text',
          type: 'text',
          text,
          fontFamily,
          fontSize,
          fontWeight,
          color: '#ffffff',
          align: 'left',
          lineHeight,
          letterSpacing,
          x: doc.widthPx / 2 - w / 2,
          y: doc.heightPx / 2 - h / 2,
          width: w,
          height: h,
        };
        const layerId = ensureActiveLayerId(() => freshLayer('Layer 1'));
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === layerId ? { ...l, objects: [...l.objects, obj] } : l,
          ),
        }));
        set({ selectedObjectId: id, additionalSelectedObjectIds: [] });
        return id;
      },

      addShapeObject: (shape) => {
        const id = uid();
        const { doc } = get();
        const w = shape === 'line' ? Math.min(400, doc.widthPx * 0.5) : 240;
        const h = shape === 'line' ? 4 : 240;
        const obj: ShapeObject = {
          ...baseObjectDefaults(),
          id,
          name: shape === 'empty' ? 'Empty' : shape[0].toUpperCase() + shape.slice(1),
          type: 'shape',
          shape,
          fillColor: shape === 'empty' || shape === 'line' ? null : '#5865f2',
          strokeColor: shape === 'line' ? '#ffffff' : null,
          strokeWidth: shape === 'line' ? 4 : 0,
          cornerRadius: 0,
          x: (doc.widthPx - w) / 2,
          y: (doc.heightPx - h) / 2,
          width: w,
          height: h,
        };
        const layerId = ensureActiveLayerId(() => freshLayer('Layer 1'));
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === layerId ? { ...l, objects: [...l.objects, obj] } : l,
          ),
        }));
        set({ selectedObjectId: id, additionalSelectedObjectIds: [] });
        return id;
      },

      updateObject: (id, patch) =>
        recordAnd(
          (d) => ({
            ...d,
            layers: d.layers.map((l) => ({
              ...l,
              objects: l.objects.map((o) => {
                if (o.id !== id) return o;
                const merged = { ...o, ...patch } as LayerObject;
                // Re-measure only when a text-metric field changed — not on
                // every x/y tick of a canvas drag.
                if (merged.type === 'text' && TEXT_METRIC_FIELDS.some((k) => k in patch)) {
                  const m = measureText(
                    merged.text,
                    merged.fontFamily,
                    merged.fontSize,
                    merged.fontWeight,
                    merged.lineHeight,
                    merged.letterSpacing,
                  );
                  merged.width = m.width;
                  merged.height = m.height;
                }
                return merged;
              }),
            })),
          }),
          // Keyed by fields (not id) so interleaved multi-select drag ticks
          // still collapse into a single undo step.
          `obj:${Object.keys(patch).sort().join('+')}`,
        ),

      removeObject: (id) => {
        const found = findObject(get().doc, id);
        if (!found) return;
        const o = found.layer.objects[found.objectIndex];
        if (o.type === 'image' && o.src.startsWith('blob:')) URL.revokeObjectURL(o.src);
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === found.layer.id ? { ...l, objects: l.objects.filter((x) => x.id !== id) } : l,
          ),
        }));
        const s = get();
        const patch: Partial<EditorState> = {};
        if (s.selectedObjectId === id) patch.selectedObjectId = null;
        if (s.additionalSelectedObjectIds.includes(id)) {
          patch.additionalSelectedObjectIds = s.additionalSelectedObjectIds.filter((x) => x !== id);
        }
        if (Object.keys(patch).length) set(patch);
      },

      duplicateObject: (id) => {
        const found = findObject(get().doc, id);
        if (!found) return;
        const src = found.layer.objects[found.objectIndex];
        const newId = uid();
        const copy: LayerObject = {
          ...cloneObject(src),
          id: newId,
          name: `${src.name} copy`,
          x: src.x + 24,
          y: src.y + 24,
        };
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === found.layer.id ? { ...l, objects: [...l.objects, copy] } : l,
          ),
        }));
        set({ selectedObjectId: newId });
      },

      reorderObject: (id, delta) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) => {
            const idx = l.objects.findIndex((o) => o.id === id);
            if (idx < 0) return l;
            const next = [...l.objects];
            const target = Math.max(0, Math.min(next.length - 1, idx + delta));
            if (target === idx) return l;
            const [item] = next.splice(idx, 1);
            next.splice(target, 0, item);
            return { ...l, objects: next };
          }),
        })),

      moveObjectToIndex: (id, targetIndex) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) => {
            const idx = l.objects.findIndex((o) => o.id === id);
            if (idx < 0) return l;
            const next = [...l.objects];
            const [item] = next.splice(idx, 1);
            const t = Math.max(
              0,
              Math.min(next.length, targetIndex > idx ? targetIndex - 1 : targetIndex),
            );
            if (t === idx) return l;
            next.splice(t, 0, item);
            return { ...l, objects: next };
          }),
        })),

      moveObjectToLayer: (id, targetLayerId, targetIndex) =>
        recordAnd((d) => {
          const found = findObject(d, id);
          if (!found || found.layer.id === targetLayerId) return d;
          const obj = found.layer.objects[found.objectIndex];
          return {
            ...d,
            layers: d.layers.map((l) => {
              if (l.id === found.layer.id) {
                return { ...l, objects: l.objects.filter((o) => o.id !== id) };
              }
              if (l.id === targetLayerId) {
                const next = [...l.objects];
                const t =
                  typeof targetIndex === 'number'
                    ? Math.max(0, Math.min(next.length, targetIndex))
                    : next.length;
                next.splice(t, 0, obj);
                return { ...l, objects: next };
              }
              return l;
            }),
          };
        }),

      // ---------------- selection ----------------

      selectObject: (id) => {
        if (id == null) {
          set({ selectedObjectId: null, additionalSelectedObjectIds: [] });
          return;
        }
        const found = findObject(get().doc, id);
        if (!found) return;
        set({
          selectedObjectId: id,
          selectedLayerId: found.layer.id,
          additionalSelectedObjectIds: [],
        });
      },

      setObjectSelection: (primary, additional) => {
        if (primary == null) {
          set({ selectedObjectId: null, additionalSelectedObjectIds: [] });
          return;
        }
        const found = findObject(get().doc, primary);
        if (!found) return;
        // additional must live in the same layer as primary.
        const sameLayerIds = new Set(found.layer.objects.map((o) => o.id));
        set({
          selectedObjectId: primary,
          selectedLayerId: found.layer.id,
          additionalSelectedObjectIds: (additional ?? []).filter(
            (x) => x !== primary && sameLayerIds.has(x),
          ),
        });
      },

      toggleAdditionalObjectSelected: (id) =>
        set((s) => {
          if (id === s.selectedObjectId) return s;
          const found = findObject(s.doc, id);
          if (!found || found.layer.id !== s.selectedLayerId) return s;
          const has = s.additionalSelectedObjectIds.includes(id);
          return {
            additionalSelectedObjectIds: has
              ? s.additionalSelectedObjectIds.filter((x) => x !== id)
              : [...s.additionalSelectedObjectIds, id],
          };
        }),

      clearAdditionalObjectSelection: () => set({ additionalSelectedObjectIds: [] }),

      // ---------------- effects (per object) ----------------

      addEffect: (objectId, kind) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) => ({
            ...l,
            objects: l.objects.map((o) =>
              o.id === objectId
                ? ({ ...o, effects: [...o.effects, defaultEffectFor(kind, uid())] } as LayerObject)
                : o,
            ),
          })),
        })),

      updateEffect: (objectId, effectId, patch) =>
        recordAnd(
          (d) => ({
            ...d,
            layers: d.layers.map((l) => ({
              ...l,
              objects: l.objects.map((o) =>
                o.id === objectId
                  ? ({
                      ...o,
                      effects: o.effects.map((e) =>
                        e.id === effectId
                          ? ({
                              ...e,
                              ...patch,
                              params: {
                                ...e.params,
                                ...((patch as { params?: object }).params ?? {}),
                              },
                            } as Effect)
                          : e,
                      ),
                    } as LayerObject)
                  : o,
              ),
            })),
          }),
          `fx:${objectId}:${effectId}:${Object.keys((patch as { params?: object }).params ?? patch)
            .sort()
            .join('+')}`,
        ),

      removeEffect: (objectId, effectId) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) => ({
            ...l,
            objects: l.objects.map((o) =>
              o.id === objectId
                ? ({ ...o, effects: o.effects.filter((e) => e.id !== effectId) } as LayerObject)
                : o,
            ),
          })),
        })),

      // ---------------- guides ----------------

      addGuide: (g) => recordAnd((d) => ({ ...d, guides: [...(d.guides ?? []), { ...g }] })),
      updateGuide: (index, g) =>
        recordAnd((d) => {
          const guides = [...(d.guides ?? [])];
          if (index < 0 || index >= guides.length) return d;
          guides[index] = { ...g };
          return { ...d, guides };
        }, `guide:${index}`),
      removeGuide: (index) =>
        recordAnd((d) => {
          const guides = [...(d.guides ?? [])];
          if (index < 0 || index >= guides.length) return d;
          guides.splice(index, 1);
          return { ...d, guides };
        }),
      clearGuides: () => recordAnd((d) => ({ ...d, guides: [] })),

      // ---------------- view + history ----------------

      setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),

      undo: () => {
        const { past, future, doc } = get();
        if (past.length === 0) return;
        breakCoalescing();
        const prev = past[past.length - 1];
        set({
          past: past.slice(0, -1),
          future: [...future, { doc: cloneDoc(doc) }].slice(-HISTORY_MAX),
          doc: prev.doc,
        });
      },

      redo: () => {
        const { past, future, doc } = get();
        if (future.length === 0) return;
        breakCoalescing();
        const next = future[future.length - 1];
        set({
          future: future.slice(0, -1),
          past: [...past, { doc: cloneDoc(doc) }].slice(-HISTORY_MAX),
          doc: next.doc,
        });
      },

      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,
    };
  }),
);

/** Helper for callers (PixiStage snap, etc.) that need flat object access. */
export function flatObjects(doc: CanvasDoc): { layer: Layer; object: LayerObject }[] {
  const out: { layer: Layer; object: LayerObject }[] = [];
  for (const l of doc.layers) for (const o of l.objects) out.push({ layer: l, object: o });
  return out;
}
