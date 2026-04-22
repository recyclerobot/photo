import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  CanvasDoc,
  Effect,
  EffectKind,
  ImageLayer,
  Layer,
  ShapeKind,
  ShapeLayer,
  TextLayer,
  ViewState,
} from './types';
import { DEFAULT_DOC } from './types';
import { defaultEffectFor } from './effects';
import { measureText } from './text';

const uid = () => Math.random().toString(36).slice(2, 10);

interface HistoryEntry {
  doc: CanvasDoc;
}

interface EditorState {
  doc: CanvasDoc;
  view: ViewState;
  selectedLayerId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];

  // doc
  setDoc: (doc: CanvasDoc, options?: { record?: boolean }) => void;
  newDoc: (widthPx: number, heightPx: number, backgroundColor: string | null) => void;
  setCanvasSize: (widthPx: number, heightPx: number) => void;
  setBackgroundColor: (color: string | null) => void;

  // layers
  addImageLayer: (
    src: string,
    naturalWidth: number,
    naturalHeight: number,
    name?: string,
  ) => string;
  addTextLayer: (text?: string) => string;
  addShapeLayer: (shape: ShapeKind) => string;
  addEmptyLayer: () => string;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, delta: number) => void;
  /**
   * Move a layer to an absolute target index in the bottom-up `doc.layers`
   * array (0 = back-most). Used by drag-to-reorder in the Layers panel.
   */
  moveLayerToIndex: (id: string, targetIndex: number) => void;
  selectLayer: (id: string | null) => void;

  // effects
  addEffect: (layerId: string, kind: EffectKind) => void;
  updateEffect: (layerId: string, effectId: string, patch: Partial<Effect>) => void;
  removeEffect: (layerId: string, effectId: string) => void;

  // view
  setView: (patch: Partial<ViewState>) => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const HISTORY_MAX = 50;

const cloneDoc = (doc: CanvasDoc): CanvasDoc => ({
  widthPx: doc.widthPx,
  heightPx: doc.heightPx,
  backgroundColor: doc.backgroundColor,
  layers: doc.layers.map((l) => ({
    ...l,
    effects: l.effects.map((e) => ({ ...e, params: { ...e.params } })),
  })) as Layer[],
});

export const useEditor = create<EditorState>()(
  subscribeWithSelector((set, get) => {
    const recordAnd = (mutator: (doc: CanvasDoc) => CanvasDoc) => {
      const { doc, past } = get();
      const nextPast = [...past, { doc: cloneDoc(doc) }].slice(-HISTORY_MAX);
      set({ doc: mutator(cloneDoc(doc)), past: nextPast, future: [] });
    };

    return {
      doc: DEFAULT_DOC,
      view: { zoom: 1, panX: 0, panY: 0 },
      selectedLayerId: null,
      past: [],
      future: [],

      setDoc: (doc, options) => {
        if (options?.record !== false) {
          const { past, doc: prev } = get();
          set({
            doc,
            past: [...past, { doc: cloneDoc(prev) }].slice(-HISTORY_MAX),
            future: [],
          });
        } else {
          set({ doc });
        }
      },

      newDoc: (widthPx, heightPx, backgroundColor) => {
        // revoke any object URLs
        get().doc.layers.forEach((l) => {
          if (l.type === 'image' && l.src.startsWith('blob:')) URL.revokeObjectURL(l.src);
        });
        set({
          doc: { widthPx, heightPx, backgroundColor, layers: [] },
          past: [],
          future: [],
          selectedLayerId: null,
        });
      },

      setCanvasSize: (widthPx, heightPx) => recordAnd((d) => ({ ...d, widthPx, heightPx })),

      setBackgroundColor: (color) => recordAnd((d) => ({ ...d, backgroundColor: color })),

      addImageLayer: (src, naturalWidth, naturalHeight, name) => {
        const id = uid();
        const { doc } = get();
        // fit while preserving aspect, max 80% of canvas
        const maxW = doc.widthPx * 0.8;
        const maxH = doc.heightPx * 0.8;
        const scale = Math.min(1, maxW / naturalWidth, maxH / naturalHeight);
        const w = naturalWidth * scale;
        const h = naturalHeight * scale;
        const layer: ImageLayer = {
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
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          effects: [],
        };
        recordAnd((d) => ({ ...d, layers: [...d.layers, layer] }));
        set({ selectedLayerId: id });
        return id;
      },

      addTextLayer: (text = 'Text') => {
        const id = uid();
        const { doc } = get();
        const fontFamily = 'Inter, system-ui, sans-serif';
        const fontSize = 64;
        const fontWeight = 600;
        const measured = measureText(text, fontFamily, fontSize, fontWeight);
        const w = Math.max(20, measured.width);
        const h = Math.max(20, measured.height);
        const layer: TextLayer = {
          id,
          name: 'Text',
          type: 'text',
          text,
          fontFamily,
          fontSize,
          fontWeight,
          color: '#ffffff',
          align: 'left',
          x: doc.widthPx / 2 - w / 2,
          y: doc.heightPx / 2 - h / 2,
          width: w,
          height: h,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          effects: [],
        };
        recordAnd((d) => ({ ...d, layers: [...d.layers, layer] }));
        set({ selectedLayerId: id });
        return id;
      },

      addShapeLayer: (shape) => {
        const id = uid();
        const { doc } = get();
        const w = shape === 'line' ? Math.min(400, doc.widthPx * 0.5) : 240;
        const h = shape === 'line' ? 4 : 240;
        const layer: ShapeLayer = {
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
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          effects: [],
        };
        recordAnd((d) => ({ ...d, layers: [...d.layers, layer] }));
        set({ selectedLayerId: id });
        return id;
      },

      addEmptyLayer: () => get().addShapeLayer('empty'),

      updateLayer: (id, patch) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) => {
            if (l.id !== id) return l;
            const merged = { ...l, ...patch } as Layer;
            // Text layers auto-size to their measured glyph bounds so the
            // bounding box always matches the rendered text and never squashes.
            if (merged.type === 'text') {
              const m = measureText(
                merged.text,
                merged.fontFamily,
                merged.fontSize,
                merged.fontWeight,
              );
              merged.width = m.width;
              merged.height = m.height;
            }
            return merged;
          }),
        })),

      removeLayer: (id) => {
        const layer = get().doc.layers.find((l) => l.id === id);
        if (layer?.type === 'image' && layer.src.startsWith('blob:')) {
          URL.revokeObjectURL(layer.src);
        }
        recordAnd((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
        if (get().selectedLayerId === id) set({ selectedLayerId: null });
      },

      duplicateLayer: (id) => {
        const src = get().doc.layers.find((l) => l.id === id);
        if (!src) return;
        const newId = uid();
        const copy: Layer = {
          ...(src as Layer),
          id: newId,
          name: `${src.name} copy`,
          x: src.x + 24,
          y: src.y + 24,
          effects: src.effects.map((e) => ({
            ...e,
            id: uid(),
            params: { ...e.params },
          })) as Effect[],
        } as Layer;
        recordAnd((d) => ({ ...d, layers: [...d.layers, copy] }));
        set({ selectedLayerId: newId });
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
          // After removal, clamp target into remaining range.
          const t = Math.max(
            0,
            Math.min(next.length, targetIndex > idx ? targetIndex - 1 : targetIndex),
          );
          if (t === idx) return d;
          next.splice(t, 0, item);
          return { ...d, layers: next };
        }),

      selectLayer: (id) => set({ selectedLayerId: id }),

      addEffect: (layerId, kind) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === layerId
              ? ({ ...l, effects: [...l.effects, defaultEffectFor(kind, uid())] } as Layer)
              : l,
          ),
        })),

      updateEffect: (layerId, effectId, patch) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === layerId
              ? ({
                  ...l,
                  effects: l.effects.map((e) =>
                    e.id === effectId
                      ? ({
                          ...e,
                          ...patch,
                          params: { ...e.params, ...(patch as any).params },
                        } as Effect)
                      : e,
                  ),
                } as Layer)
              : l,
          ),
        })),

      removeEffect: (layerId, effectId) =>
        recordAnd((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.id === layerId
              ? ({ ...l, effects: l.effects.filter((e) => e.id !== effectId) } as Layer)
              : l,
          ),
        })),

      setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),

      undo: () => {
        const { past, future, doc } = get();
        if (past.length === 0) return;
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
