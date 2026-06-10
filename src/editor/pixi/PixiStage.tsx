import { useEffect, useRef, useState } from 'react';
import { Application, Graphics } from 'pixi.js';
import { useEditor, flatObjects } from '../store';
import { PixiScene } from './PixiScene';
import { TransformOverlay, type HandleId } from './transformOverlay';
import { SnapGuides, type GuideLine } from './snapGuides';
import { setActiveScene, clearActiveScene } from './sceneRef';
import { measureText } from '../text';
import type { LayerObject, TextObject } from '../types';

interface DragState {
  startX: number;
  startY: number;
  objectStart: LayerObject;
  handle: HandleId;
  pivotDocX: number;
  pivotDocY: number;
  startAngle: number;
  /** Snapshot of additional-selected objects for group move. */
  additionalStarts?: { id: string; x: number; y: number }[];
}

interface MarqueeState {
  startDocX: number;
  startDocY: number;
  startScreenX: number;
  startScreenY: number;
  curScreenX: number;
  curScreenY: number;
  /** Whether the user has actually dragged (rather than just clicked). */
  moved: boolean;
  additive: boolean;
}

/**
 * Compute snapped position for a moving object + the guide lines to draw.
 * Snaps the object's L/CX/R to the canvas + every other object's L/CX/R
 * (and same for vertical). `threshold` is in doc-space pixels.
 */
function computeSnap(
  start: LayerObject,
  wantX: number,
  wantY: number,
  threshold: number,
): { x: number; y: number; guides: GuideLine[] } {
  const { doc } = useEditor.getState();
  const w = start.width;
  const h = start.height;

  const vCandidates: { pos: number; ext: [number, number] }[] = [
    { pos: 0, ext: [0, doc.heightPx] },
    { pos: doc.widthPx / 2, ext: [0, doc.heightPx] },
    { pos: doc.widthPx, ext: [0, doc.heightPx] },
  ];
  const hCandidates: { pos: number; ext: [number, number] }[] = [
    { pos: 0, ext: [0, doc.widthPx] },
    { pos: doc.heightPx / 2, ext: [0, doc.widthPx] },
    { pos: doc.heightPx, ext: [0, doc.widthPx] },
  ];
  for (const { object: o } of flatObjects(doc)) {
    if (o.id === start.id) continue;
    const l1 = o.x;
    const l2 = o.x + o.width;
    const lc = o.x + o.width / 2;
    const t1 = o.y;
    const t2 = o.y + o.height;
    const tc = o.y + o.height / 2;
    vCandidates.push({ pos: l1, ext: [t1, t2] });
    vCandidates.push({ pos: lc, ext: [t1, t2] });
    vCandidates.push({ pos: l2, ext: [t1, t2] });
    hCandidates.push({ pos: t1, ext: [l1, l2] });
    hCandidates.push({ pos: tc, ext: [l1, l2] });
    hCandidates.push({ pos: t2, ext: [l1, l2] });
  }
  for (const g of doc.guides ?? []) {
    if (g.axis === 'v') vCandidates.push({ pos: g.pos, ext: [0, doc.heightPx] });
    else hCandidates.push({ pos: g.pos, ext: [0, doc.widthPx] });
  }

  let bestDx = Infinity;
  let bestX = wantX;
  let bestVPos: number | null = null;
  let bestVExt: [number, number] = [0, 0];
  for (const c of vCandidates) {
    for (const off of [0, w / 2, w]) {
      const d = c.pos - (wantX + off);
      if (Math.abs(d) < Math.abs(bestDx)) {
        bestDx = d;
        bestX = wantX + d;
        bestVPos = c.pos;
        bestVExt = c.ext;
      }
    }
  }
  let bestDy = Infinity;
  let bestY = wantY;
  let bestHPos: number | null = null;
  let bestHExt: [number, number] = [0, 0];
  for (const c of hCandidates) {
    for (const off of [0, h / 2, h]) {
      const d = c.pos - (wantY + off);
      if (Math.abs(d) < Math.abs(bestDy)) {
        bestDy = d;
        bestY = wantY + d;
        bestHPos = c.pos;
        bestHExt = c.ext;
      }
    }
  }

  const guides: GuideLine[] = [];
  const finalX = Math.abs(bestDx) <= threshold ? bestX : wantX;
  const finalY = Math.abs(bestDy) <= threshold ? bestY : wantY;
  if (Math.abs(bestDx) <= threshold && bestVPos != null) {
    const top = Math.min(bestVExt[0], finalY);
    const bot = Math.max(bestVExt[1], finalY + h);
    guides.push({ axis: 'v', pos: bestVPos, start: top, end: bot });
  }
  if (Math.abs(bestDy) <= threshold && bestHPos != null) {
    const left = Math.min(bestHExt[0], finalX);
    const right = Math.max(bestHExt[1], finalX + w);
    guides.push({ axis: 'h', pos: bestHPos, start: left, end: right });
  }
  return { x: finalX, y: finalY, guides };
}

function findObject(objectId: string | null): LayerObject | undefined {
  if (!objectId) return undefined;
  for (const { object } of flatObjects(useEditor.getState().doc)) {
    if (object.id === objectId) return object;
  }
  return undefined;
}

/** An object can't be transformed when it — or its parent layer — is locked. */
function isObjectLocked(objectId: string | null): boolean {
  if (!objectId) return false;
  for (const { layer, object } of flatObjects(useEditor.getState().doc)) {
    if (object.id === objectId) return layer.locked || object.locked;
  }
  return false;
}

/**
 * Full-page Pixi canvas. Owns the PixiScene + TransformOverlay and bridges
 * pointer/wheel/keyboard input into the editor store. All transform
 * operations target the currently selected `LayerObject` (drawable);
 * marquee selection picks objects within the active layer.
 */
export function PixiStage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<PixiScene | null>(null);
  const overlayRef = useRef<TransformOverlay | null>(null);
  const guidesRef = useRef<SnapGuides | null>(null);
  const additionalOutlinesRef = useRef<Graphics | null>(null);
  const appRef = useRef<Application | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  // Mount Pixi once.
  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    const app = new Application();

    (async () => {
      await app.init({
        background: 0x1a1b1e,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: host,
      });
      if (cancelled) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);
      const scene = new PixiScene(app);
      const overlay = new TransformOverlay();
      const guides = new SnapGuides();
      const additionalOutlines = new Graphics();
      scene.overlayRoot.addChild(additionalOutlines);
      scene.overlayRoot.addChild(overlay.container);
      scene.overlayRoot.addChild(guides.container);
      sceneRef.current = scene;
      overlayRef.current = overlay;
      guidesRef.current = guides;
      additionalOutlinesRef.current = additionalOutlines;
      appRef.current = app;

      const { doc, view } = useEditor.getState();
      await scene.syncDoc(doc);
      scene.setView(view.zoom, view.panX, view.panY, app.renderer.width, app.renderer.height);
      drawOverlay();
    })();

    return () => {
      cancelled = true;
      try {
        app.destroy(true, { children: true, texture: false });
      } catch {
        /* ignore */
      }
      sceneRef.current = null;
      overlayRef.current = null;
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const unsub = useEditor.subscribe(
      (s) => s.doc,
      async (doc) => {
        const scene = sceneRef.current;
        if (!scene) return;
        await scene.syncDoc(doc);
        drawOverlay();
      },
      { fireImmediately: false },
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = useEditor.subscribe(
      (s) => s.view,
      (view) => {
        const scene = sceneRef.current;
        const app = appRef.current;
        if (!scene || !app) return;
        scene.setView(view.zoom, view.panX, view.panY, app.renderer.width, app.renderer.height);
        drawOverlay();
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = useEditor.subscribe(
      (s) => s.selectedObjectId,
      () => drawOverlay(),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = useEditor.subscribe(
      (s) => s.additionalSelectedObjectIds,
      () => drawOverlay(),
    );
    return unsub;
  }, []);

  // Resize handler — re-center on viewport resize.
  useEffect(() => {
    const onResize = () => {
      const scene = sceneRef.current;
      const app = appRef.current;
      if (!scene || !app) return;
      const { view } = useEditor.getState();
      scene.setView(view.zoom, view.panX, view.panY, app.renderer.width, app.renderer.height);
      drawOverlay();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------- helpers ----------

  function drawOverlay() {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    const additional = additionalOutlinesRef.current;
    if (!scene || !overlay || !additional) return;
    const { doc, selectedObjectId, additionalSelectedObjectIds, view } = useEditor.getState();
    const primary = selectedObjectId ? findObject(selectedObjectId) : undefined;
    if (!primary) overlay.hide();
    else overlay.draw(primary, 1 / view.zoom, isObjectLocked(primary.id));

    additional.clear();
    const inv = 1 / view.zoom;
    const allObjects = flatObjects(doc);
    for (const id of additionalSelectedObjectIds) {
      const o = allObjects.find((p) => p.object.id === id)?.object;
      if (!o) continue;
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2;
      const cosR = Math.cos(o.rotation);
      const sinR = Math.sin(o.rotation);
      const corners = [
        [-o.width / 2, -o.height / 2],
        [o.width / 2, -o.height / 2],
        [o.width / 2, o.height / 2],
        [-o.width / 2, o.height / 2],
      ].map(([dx, dy]) => [cx + dx * cosR - dy * sinR, cy + dx * sinR + dy * cosR]);
      additional.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < corners.length; i++) additional.lineTo(corners[i][0], corners[i][1]);
      additional.lineTo(corners[0][0], corners[0][1]);
    }
    additional.stroke({ width: 1.5 * inv, color: 0xff3b8b, alpha: 0.9 });
  }

  function clientToDoc(clientX: number, clientY: number): { x: number; y: number } | null {
    const scene = sceneRef.current;
    const app = appRef.current;
    if (!scene || !app) return null;
    const rect = app.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wr = scene.worldRoot;
    const x = (sx - wr.position.x) / wr.scale.x;
    const y = (sy - wr.position.y) / wr.scale.y;
    return { x, y };
  }

  // ---------- pointer interactions ----------

  const dragRef = useRef<DragState | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );
  const spaceDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDownRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDownRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui-overlay]')) return;
    const pt = clientToDoc(e.clientX, e.clientY);
    if (!pt) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (spaceDownRef.current || e.button === 1) {
      const { view } = useEditor.getState();
      panningRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: view.panX,
        panY: view.panY,
      };
      return;
    }

    const state = useEditor.getState();
    const overlay = overlayRef.current!;
    const selected = findObject(state.selectedObjectId);
    if (selected && !isObjectLocked(selected.id)) {
      const handle = overlay.hitTest(selected, pt.x, pt.y, 1 / state.view.zoom);
      if (handle) {
        dragRef.current = {
          startX: pt.x,
          startY: pt.y,
          objectStart: { ...selected },
          handle,
          pivotDocX: selected.x + selected.width / 2,
          pivotDocY: selected.y + selected.height / 2,
          startAngle: Math.atan2(
            pt.y - (selected.y + selected.height / 2),
            pt.x - (selected.x + selected.width / 2),
          ),
        };
        return;
      }
    }

    const scene = sceneRef.current!;
    const hit = scene.hitTestDocPoint(pt.x, pt.y);
    if (!hit) {
      // Empty space: begin marquee multi-select. We do NOT clear selection
      // yet — we'll do it on pointerUp if no drag occurred.
      const rect = appRef.current!.canvas.getBoundingClientRect();
      setMarquee({
        startDocX: pt.x,
        startDocY: pt.y,
        startScreenX: e.clientX - rect.left,
        startScreenY: e.clientY - rect.top,
        curScreenX: e.clientX - rect.left,
        curScreenY: e.clientY - rect.top,
        moved: false,
        additive: e.shiftKey || e.metaKey || e.ctrlKey,
      });
      return;
    }

    // Hit an object inside a layer.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      // Toggle into multi-selection on the same layer; if different layer,
      // switch active layer to that one and select just this object.
      const s2 = useEditor.getState();
      if (!s2.selectedObjectId || s2.selectedLayerId !== hit.layerId) {
        s2.selectObject(hit.objectId);
        return;
      }
      if (hit.objectId === s2.selectedObjectId) {
        const next = s2.additionalSelectedObjectIds;
        if (next.length > 0) s2.setObjectSelection(next[0], next.slice(1));
        else s2.selectObject(null);
      } else {
        s2.toggleAdditionalObjectSelected(hit.objectId);
      }
      return;
    }

    const s2 = useEditor.getState();
    const isAlreadySelected =
      hit.objectId === s2.selectedObjectId || s2.additionalSelectedObjectIds.includes(hit.objectId);
    if (!isAlreadySelected) s2.selectObject(hit.objectId);

    const sel = findObject(hit.objectId);
    if (!sel) return;
    const allAdditional = useEditor.getState().additionalSelectedObjectIds;
    const additionalStarts = allAdditional
      .filter((id) => !isObjectLocked(id))
      .map((id) => findObject(id))
      .filter((o): o is LayerObject => !!o)
      .map((o) => ({ id: o.id, x: o.x, y: o.y }));
    dragRef.current = {
      startX: pt.x,
      startY: pt.y,
      objectStart: { ...sel },
      handle: 'move',
      pivotDocX: sel.x + sel.width / 2,
      pivotDocY: sel.y + sel.height / 2,
      startAngle: 0,
      additionalStarts,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = clientToDoc(e.clientX, e.clientY);
    if (!pt) return;

    if (panningRef.current) {
      const p = panningRef.current;
      useEditor.getState().setView({
        panX: p.panX + (e.clientX - p.startX),
        panY: p.panY + (e.clientY - p.startY),
      });
      return;
    }

    if (marquee) {
      const rect = appRef.current!.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const moved =
        marquee.moved ||
        Math.abs(sx - marquee.startScreenX) + Math.abs(sy - marquee.startScreenY) > 3;
      setMarquee({ ...marquee, curScreenX: sx, curScreenY: sy, moved });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const { objectStart, handle } = drag;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;

    if (handle === 'move') {
      const wantX = objectStart.x + dx;
      const wantY = objectStart.y + dy;
      let nx = wantX;
      let ny = wantY;
      const guideLines: GuideLine[] = [];
      if (!e.altKey) {
        const snap = computeSnap(
          objectStart,
          wantX,
          wantY,
          6 / Math.max(0.001, useEditor.getState().view.zoom),
        );
        nx = snap.x;
        ny = snap.y;
        guideLines.push(...snap.guides);
      }
      const finalDx = nx - objectStart.x;
      const finalDy = ny - objectStart.y;
      const store = useEditor.getState();
      store.updateObject(objectStart.id, { x: nx, y: ny } as Partial<LayerObject>);
      if (drag.additionalStarts && drag.additionalStarts.length) {
        for (const a of drag.additionalStarts) {
          store.updateObject(a.id, {
            x: a.x + finalDx,
            y: a.y + finalDy,
          } as Partial<LayerObject>);
        }
      }
      const view = store.view;
      guidesRef.current?.draw(guideLines, 1 / view.zoom);
      return;
    }

    if (handle === 'rotate') {
      const angle = Math.atan2(pt.y - drag.pivotDocY, pt.x - drag.pivotDocX);
      let next = objectStart.rotation + (angle - drag.startAngle);
      if (e.shiftKey) {
        const step = Math.PI / 12;
        next = Math.round(next / step) * step;
      }
      useEditor.getState().updateObject(objectStart.id, { rotation: next } as Partial<LayerObject>);
      return;
    }

    // Resize. Compute in object-local coords.
    const c = Math.cos(-objectStart.rotation);
    const s = Math.sin(-objectStart.rotation);
    const ldx = dx * c - dy * s;
    const ldy = dx * s + dy * c;
    const horiz = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const vert = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;

    if (objectStart.type === 'text') {
      const tl = objectStart as TextObject;
      const sX =
        horiz === 0 ? 1 : Math.max(0.05, (objectStart.width + horiz * ldx) / objectStart.width);
      const sY =
        vert === 0 ? 1 : Math.max(0.05, (objectStart.height + vert * ldy) / objectStart.height);
      const factor = horiz === 0 ? sY : vert === 0 ? sX : Math.max(sX, sY);
      const newFontSize = Math.max(4, Math.round(tl.fontSize * factor));
      const m = measureText(tl.text, tl.fontFamily, newFontSize, tl.fontWeight);
      const ax = horiz === 1 ? 0 : horiz === -1 ? 1 : 0.5;
      const ay = vert === 1 ? 0 : vert === -1 ? 1 : 0.5;
      const anchorDocX = objectStart.x + ax * objectStart.width;
      const anchorDocY = objectStart.y + ay * objectStart.height;
      useEditor.getState().updateObject(objectStart.id, {
        fontSize: newFontSize,
        x: anchorDocX - ax * m.width,
        y: anchorDocY - ay * m.height,
      } as Partial<LayerObject>);
      return;
    }

    let nx = objectStart.x;
    let ny = objectStart.y;
    let nw = objectStart.width;
    let nh = objectStart.height;

    if (horiz === 1) nw = Math.max(8, objectStart.width + ldx);
    if (horiz === -1) {
      nw = Math.max(8, objectStart.width - ldx);
      nx = objectStart.x + (objectStart.width - nw);
    }
    if (vert === 1) nh = Math.max(8, objectStart.height + ldy);
    if (vert === -1) {
      nh = Math.max(8, objectStart.height - ldy);
      ny = objectStart.y + (objectStart.height - nh);
    }
    if (e.shiftKey && horiz !== 0 && vert !== 0) {
      const aspect = objectStart.width / objectStart.height;
      if (Math.abs(nw / aspect - nh) > 0.5) {
        nh = nw / aspect;
        if (vert === -1) ny = objectStart.y + (objectStart.height - nh);
      }
    }
    if (e.altKey) {
      nx = drag.pivotDocX - nw / 2;
      ny = drag.pivotDocY - nh / 2;
    }

    useEditor.getState().updateObject(objectStart.id, {
      x: nx,
      y: ny,
      width: nw,
      height: nh,
    } as Partial<LayerObject>);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    if (marquee) {
      if (!marquee.moved) {
        if (!marquee.additive) useEditor.getState().selectObject(null);
      } else {
        const pt = clientToDoc(e.clientX, e.clientY);
        if (pt) {
          const x1 = Math.min(marquee.startDocX, pt.x);
          const y1 = Math.min(marquee.startDocY, pt.y);
          const x2 = Math.max(marquee.startDocX, pt.x);
          const y2 = Math.max(marquee.startDocY, pt.y);
          const state = useEditor.getState();
          const { doc, selectedLayerId } = state;
          // Restrict marquee to objects in the active layer when one exists;
          // fall back to all visible objects otherwise.
          const candidates: { layerId: string; obj: LayerObject }[] = [];
          for (const layer of doc.layers) {
            if (selectedLayerId && layer.id !== selectedLayerId) continue;
            if (!layer.visible || layer.locked) continue;
            for (const o of layer.objects) {
              if (!o.visible || o.locked) continue;
              const ox2 = o.x + o.width;
              const oy2 = o.y + o.height;
              const overlaps = !(ox2 < x1 || o.x > x2 || oy2 < y1 || o.y > y2);
              if (overlaps) candidates.push({ layerId: layer.id, obj: o });
            }
          }
          // Top-most first (within each layer the last index renders on top;
          // across layers we iterate the layer order accordingly).
          candidates.reverse();
          if (marquee.additive) {
            const merged = new Set<string>([
              ...(state.selectedObjectId ? [state.selectedObjectId] : []),
              ...state.additionalSelectedObjectIds,
              ...candidates.map((c) => c.obj.id),
            ]);
            const arr = Array.from(merged);
            const primary = state.selectedObjectId ?? arr[0] ?? null;
            state.setObjectSelection(
              primary,
              arr.filter((id) => id !== primary),
            );
          } else if (candidates.length === 0) {
            state.selectObject(null);
          } else {
            const [first, ...rest] = candidates;
            state.setObjectSelection(
              first.obj.id,
              rest.map((c) => c.obj.id),
            );
          }
        }
      }
      setMarquee(null);
    }
    dragRef.current = null;
    panningRef.current = null;
    guidesRef.current?.hide();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { view } = useEditor.getState();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextZoom = Math.max(0.1, Math.min(8, view.zoom * factor));

    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !scene) return;
    const rect = app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wr = scene.worldRoot;
    const docX = (sx - wr.position.x) / wr.scale.x;
    const docY = (sy - wr.position.y) / wr.scale.y;
    const screenW = app.renderer.width;
    const screenH = app.renderer.height;
    const docW = (scene as unknown as { currentDocSize: { w: number; h: number } }).currentDocSize
      .w;
    const docH = (scene as unknown as { currentDocSize: { w: number; h: number } }).currentDocSize
      .h;
    const newPosX = sx - docX * nextZoom;
    const newPosY = sy - docY * nextZoom;
    const panX = newPosX - (screenW / 2 - (docW * nextZoom) / 2);
    const panY = newPosY - (screenH / 2 - (docH * nextZoom) / 2);
    useEditor.getState().setView({ zoom: nextZoom, panX, panY });
  };

  useEffect(() => {
    setActiveScene(() => sceneRef.current);
    return () => clearActiveScene();
  }, []);

  useEffect(() => {
    sceneRef.current?.setEditingId(editingId);
  }, [editingId]);

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui-overlay]')) return;
    const pt = clientToDoc(e.clientX, e.clientY);
    if (!pt) return;
    const scene = sceneRef.current;
    if (!scene) return;
    const hit = scene.hitTestDocPoint(pt.x, pt.y);
    if (!hit) return;
    const obj = findObject(hit.objectId);
    if (obj && obj.type === 'text') {
      useEditor.getState().selectObject(hit.objectId);
      setEditingId(hit.objectId);
    }
  };

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      style={{ touchAction: 'none', cursor: spaceDownRef.current ? 'grab' : 'default' }}
    >
      {editingId && hostRef.current && (
        <TextEditorOverlay
          objectId={editingId}
          host={hostRef.current}
          onCommit={() => setEditingId(null)}
        />
      )}
      {marquee && marquee.moved && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: Math.min(marquee.startScreenX, marquee.curScreenX),
            top: Math.min(marquee.startScreenY, marquee.curScreenY),
            width: Math.abs(marquee.curScreenX - marquee.startScreenX),
            height: Math.abs(marquee.curScreenY - marquee.startScreenY),
            background: 'rgba(255, 59, 139, 0.08)',
            border: '1px solid rgba(255, 59, 139, 0.85)',
            zIndex: 20,
          }}
        />
      )}
    </div>
  );
}

/**
 * HTML <textarea> overlay positioned to match a text object's screen rect.
 * Auto-grows as the user types because the underlying object auto-sizes.
 * Commits on Enter (without Shift), Escape, or blur.
 */
function TextEditorOverlay({
  objectId,
  host,
  onCommit,
}: {
  objectId: string;
  host: HTMLDivElement;
  onCommit: () => void;
}) {
  const obj = useEditor((s) => {
    for (const layer of s.doc.layers) {
      const o = layer.objects.find((x) => x.id === objectId);
      if (o) return o;
    }
    return undefined;
  });
  const view = useEditor((s) => s.view);
  const docSize = useEditor((s) => ({ w: s.doc.widthPx, h: s.doc.heightPx }));
  const updateObject = useEditor((s) => s.updateObject);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);

  if (!obj || obj.type !== 'text') return null;
  const tl = obj;

  const hostRect = host.getBoundingClientRect();
  const screenW = hostRect.width;
  const screenH = hostRect.height;
  const worldX = screenW / 2 - (docSize.w * view.zoom) / 2 + view.panX;
  const worldY = screenH / 2 - (docSize.h * view.zoom) / 2 + view.panY;
  const left = worldX + tl.x * view.zoom;
  const top = worldY + tl.y * view.zoom;

  return (
    <textarea
      ref={taRef}
      data-ui-overlay
      value={tl.text}
      onChange={(e) => updateObject(tl.id, { text: e.target.value } as Partial<LayerObject>)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          onCommit();
        }
      }}
      onBlur={onCommit}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      spellCheck={false}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(20, tl.width * view.zoom)}px`,
        height: `${Math.max(20, tl.height * view.zoom)}px`,
        transformOrigin: '50% 50%',
        transform: `rotate(${tl.rotation}rad)`,
        font: `${tl.fontWeight} ${tl.fontSize * view.zoom}px ${tl.fontFamily}`,
        lineHeight: 1.25,
        color: tl.color,
        background: 'transparent',
        textAlign: tl.align,
        border: '1px dashed #5865f2',
        outline: 'none',
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre',
        boxSizing: 'content-box',
        opacity: tl.opacity,
        caretColor: tl.color,
        zIndex: 30,
      }}
    />
  );
}
