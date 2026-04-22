import { Graphics, Container } from 'pixi.js';
import type { Layer } from '../types';

const HANDLE_SIZE = 10;
const HANDLE_COLOR = 0x5865f2;
const HANDLE_BORDER = 0xffffff;
const ROTATE_OFFSET = 28;

export type HandleId = 'move' | 'rotate' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface HandleHit {
  id: HandleId;
  /** Doc-space coords of the handle center (for cursor) */
  x: number;
  y: number;
}

/**
 * Draws a transform overlay (selection rectangle + 8 resize handles + rotate
 * handle) for a layer in doc space. All coords are in doc pixels — the parent
 * container is the scaled `worldRoot` so visual size scales with zoom.
 *
 * To keep handles a constant pixel size on screen we accept a `inverseZoom`
 * scale and apply it to the handle graphics.
 */
export class TransformOverlay {
  container: Container;
  private outline = new Graphics();
  private handles = new Graphics();

  constructor() {
    this.container = new Container();
    this.container.addChild(this.outline, this.handles);
    this.container.eventMode = 'none';
    this.container.visible = false;
  }

  hide() {
    this.container.visible = false;
  }

  draw(layer: Layer, inverseZoom: number) {
    this.container.visible = true;
    const { x, y, width, height, rotation } = layer;
    const cx = x + width / 2;
    const cy = y + height / 2;
    this.container.position.set(cx, cy);
    this.container.rotation = rotation;

    const w = width;
    const h = height;
    const hw = w / 2;
    const hh = h / 2;
    const hsz = HANDLE_SIZE * inverseZoom;
    const ro = ROTATE_OFFSET * inverseZoom;

    this.outline.clear();
    this.outline
      .rect(-hw, -hh, w, h)
      .stroke({ width: 1.5 * inverseZoom, color: HANDLE_COLOR, alpha: 0.9 });
    // rotate stem
    this.outline
      .moveTo(0, -hh)
      .lineTo(0, -hh - ro)
      .stroke({ width: 1.5 * inverseZoom, color: HANDLE_COLOR, alpha: 0.9 });

    this.handles.clear();
    const drawHandle = (px: number, py: number) => {
      this.handles
        .rect(px - hsz / 2, py - hsz / 2, hsz, hsz)
        .fill(HANDLE_BORDER)
        .stroke({ width: 1.5 * inverseZoom, color: HANDLE_COLOR });
    };
    drawHandle(-hw, -hh);
    drawHandle(0, -hh);
    drawHandle(hw, -hh);
    drawHandle(hw, 0);
    drawHandle(hw, hh);
    drawHandle(0, hh);
    drawHandle(-hw, hh);
    drawHandle(-hw, 0);
    // rotate handle (circle)
    this.handles
      .circle(0, -hh - ro, hsz / 1.4)
      .fill(HANDLE_BORDER)
      .stroke({ width: 1.5 * inverseZoom, color: HANDLE_COLOR });
  }

  /** Hit-test in doc space; returns which handle was hit, or null. */
  hitTest(layer: Layer, docX: number, docY: number, inverseZoom: number): HandleId | null {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const dx = docX - cx;
    const dy = docY - cy;
    const c = Math.cos(-layer.rotation);
    const s = Math.sin(-layer.rotation);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const hw = layer.width / 2;
    const hh = layer.height / 2;
    const hsz = HANDLE_SIZE * inverseZoom;
    const ro = ROTATE_OFFSET * inverseZoom;
    const tol = hsz;

    const near = (px: number, py: number) =>
      Math.abs(lx - px) <= tol / 2 && Math.abs(ly - py) <= tol / 2;

    if (near(0, -hh - ro)) return 'rotate';
    if (near(-hw, -hh)) return 'nw';
    if (near(0, -hh)) return 'n';
    if (near(hw, -hh)) return 'ne';
    if (near(hw, 0)) return 'e';
    if (near(hw, hh)) return 'se';
    if (near(0, hh)) return 's';
    if (near(-hw, hh)) return 'sw';
    if (near(-hw, 0)) return 'w';
    if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) return 'move';
    return null;
  }
}
