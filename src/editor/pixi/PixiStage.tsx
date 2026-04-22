import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { useEditor } from '../store';
import { PixiScene } from './PixiScene';
import { TransformOverlay, type HandleId } from './transformOverlay';
import { setActiveScene, clearActiveScene } from './sceneRef';
import type { Layer } from '../types';

interface DragState {
  startX: number;
  startY: number;
  layerStart: Layer;
  handle: HandleId;
  pivotDocX: number;
  pivotDocY: number;
  startAngle: number;
}

/**
 * Full-page Pixi canvas. Owns the PixiScene + TransformOverlay and bridges
 * pointer/wheel/keyboard input into the editor store.
 */
export function PixiStage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<PixiScene | null>(null);
  const overlayRef = useRef<TransformOverlay | null>(null);
  const appRef = useRef<Application | null>(null);

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
      scene.overlayRoot.addChild(overlay.container);
      sceneRef.current = scene;
      overlayRef.current = overlay;
      appRef.current = app;

      // Initial sync
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

  // Re-sync on store changes
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
      (s) => s.selectedLayerId,
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
    if (!scene || !overlay) return;
    const { doc, selectedLayerId, view } = useEditor.getState();
    const layer = doc.layers.find((l) => l.id === selectedLayerId);
    if (!layer) {
      overlay.hide();
      return;
    }
    overlay.draw(layer, 1 / view.zoom);
  }

  function clientToDoc(clientX: number, clientY: number): { x: number; y: number } | null {
    const scene = sceneRef.current;
    const app = appRef.current;
    if (!scene || !app) return null;
    const rect = app.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    // worldRoot has scale=zoom and position computed in setView
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

    const { doc, selectedLayerId, view } = useEditor.getState();
    const overlay = overlayRef.current!;
    const selected = doc.layers.find((l) => l.id === selectedLayerId);
    if (selected) {
      const handle = overlay.hitTest(selected, pt.x, pt.y, 1 / view.zoom);
      if (handle) {
        dragRef.current = {
          startX: pt.x,
          startY: pt.y,
          layerStart: { ...selected },
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
    // Otherwise hit-test layer stack
    const scene = sceneRef.current!;
    const hit = scene.hitTestDocPoint(pt.x, pt.y);
    useEditor.getState().selectLayer(hit);
    if (hit) {
      const layer = doc.layers.find((l) => l.id === hit)!;
      dragRef.current = {
        startX: pt.x,
        startY: pt.y,
        layerStart: { ...layer },
        handle: 'move',
        pivotDocX: layer.x + layer.width / 2,
        pivotDocY: layer.y + layer.height / 2,
        startAngle: 0,
      };
    }
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

    const drag = dragRef.current;
    if (!drag) return;
    const { layerStart, handle } = drag;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;

    if (handle === 'move') {
      useEditor.getState().updateLayer(layerStart.id, {
        x: layerStart.x + dx,
        y: layerStart.y + dy,
      } as Partial<Layer>);
      return;
    }

    if (handle === 'rotate') {
      const angle = Math.atan2(pt.y - drag.pivotDocY, pt.x - drag.pivotDocX);
      let next = layerStart.rotation + (angle - drag.startAngle);
      if (e.shiftKey) {
        const step = Math.PI / 12; // 15°
        next = Math.round(next / step) * step;
      }
      useEditor.getState().updateLayer(layerStart.id, { rotation: next } as Partial<Layer>);
      return;
    }

    // Resize. Compute in layer-local coords.
    const c = Math.cos(-layerStart.rotation);
    const s = Math.sin(-layerStart.rotation);
    const ldx = dx * c - dy * s;
    const ldy = dx * s + dy * c;
    let nx = layerStart.x;
    let ny = layerStart.y;
    let nw = layerStart.width;
    let nh = layerStart.height;
    const horiz = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const vert = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;

    if (horiz === 1) nw = Math.max(8, layerStart.width + ldx);
    if (horiz === -1) {
      nw = Math.max(8, layerStart.width - ldx);
      nx = layerStart.x + (layerStart.width - nw);
    }
    if (vert === 1) nh = Math.max(8, layerStart.height + ldy);
    if (vert === -1) {
      nh = Math.max(8, layerStart.height - ldy);
      ny = layerStart.y + (layerStart.height - nh);
    }
    if (e.shiftKey && horiz !== 0 && vert !== 0) {
      const aspect = layerStart.width / layerStart.height;
      if (Math.abs(nw / aspect - nh) > 0.5) {
        nh = nw / aspect;
        if (vert === -1) ny = layerStart.y + (layerStart.height - nh);
      }
    }
    if (e.altKey) {
      // Resize from center: keep center fixed.
      nx = drag.pivotDocX - nw / 2;
      ny = drag.pivotDocY - nh / 2;
    }

    useEditor.getState().updateLayer(layerStart.id, {
      x: nx,
      y: ny,
      width: nw,
      height: nh,
    } as Partial<Layer>);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    dragRef.current = null;
    panningRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { view } = useEditor.getState();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextZoom = Math.max(0.1, Math.min(8, view.zoom * factor));

    // Zoom toward cursor: keep doc point under cursor stationary.
    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !scene) return;
    const rect = app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wr = scene.worldRoot;
    const docX = (sx - wr.position.x) / wr.scale.x;
    const docY = (sy - wr.position.y) / wr.scale.y;
    // After zoom change, we want sx = docX*nextZoom + newPos.x
    const screenW = app.renderer.width;
    const screenH = app.renderer.height;
    const docW = scene['currentDocSize'].w;
    const docH = scene['currentDocSize'].h;
    const newPosX = sx - docX * nextZoom;
    const newPosY = sy - docY * nextZoom;
    // setView computes pos as: cx = screenW/2 - docW*zoom/2 + panX
    const panX = newPosX - (screenW / 2 - (docW * nextZoom) / 2);
    const panY = newPosY - (screenH / 2 - (docH * nextZoom) / 2);
    useEditor.getState().setView({ zoom: nextZoom, panX, panY });
  };

  // expose scene ref for export
  useEffect(() => {
    setActiveScene(() => sceneRef.current);
    return () => clearActiveScene();
  }, []);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{ touchAction: 'none', cursor: spaceDownRef.current ? 'grab' : 'default' }}
    />
  );
}
