import {
  Application,
  Container,
  Sprite,
  Text,
  Texture,
  Graphics,
  Assets,
  Rectangle,
  type ContainerChild,
} from 'pixi.js';
import type { CanvasDoc, Layer, ImageLayer, TextLayer } from '../types';
import { buildFilters } from './filters';

interface LayerNode {
  layer: Layer;
  display: Sprite | Text;
  textureKey?: string; // for image layers, the src we loaded
}

/**
 * Owns a Pixi Application + the document scene graph and reconciles it with
 * the editor store on every change.
 */
export class PixiScene {
  app: Application;
  /** Root that we pan/zoom (screen-space transform) */
  worldRoot: Container;
  /** Container sized to the document; (0,0) = top-left of the canvas. */
  docRoot: Container;
  /** Checkerboard transparency backdrop, behind everything (not exported). */
  checkerboard: Graphics;
  /** Solid background fill (only when doc.backgroundColor is set). */
  bgFill: Graphics;
  /** Holds all user layers. */
  layersRoot: Container;
  /** Selection / handle overlay, on top, never exported. */
  overlayRoot: Container;

  private nodes = new Map<string, LayerNode>();
  private currentDocSize = { w: 0, h: 0 };
  private currentBg: string | null = null;

  constructor(app: Application) {
    this.app = app;
    this.worldRoot = new Container();
    this.docRoot = new Container();
    this.checkerboard = new Graphics();
    this.bgFill = new Graphics();
    this.layersRoot = new Container();
    this.overlayRoot = new Container();

    this.docRoot.addChild(this.checkerboard, this.bgFill, this.layersRoot);
    this.worldRoot.addChild(this.docRoot, this.overlayRoot);
    app.stage.addChild(this.worldRoot);

    // Mask docRoot to its bounds so layers outside the canvas are clipped.
    this.applyDocMask();
  }

  private docMask = new Graphics();
  private applyDocMask() {
    this.docRoot.addChild(this.docMask);
    this.docRoot.mask = this.docMask;
  }

  /** Apply screen transform (pan + zoom). docRoot is always at doc-pixel scale. */
  setView(zoom: number, panX: number, panY: number, screenW: number, screenH: number) {
    this.worldRoot.scale.set(zoom);
    // Center doc in the viewport then offset by pan
    const cx = screenW / 2 - (this.currentDocSize.w * zoom) / 2 + panX;
    const cy = screenH / 2 - (this.currentDocSize.h * zoom) / 2 + panY;
    this.worldRoot.position.set(cx, cy);
  }

  /** Diff & apply a doc snapshot. */
  async syncDoc(doc: CanvasDoc) {
    // Resize backdrop / mask if needed
    if (doc.widthPx !== this.currentDocSize.w || doc.heightPx !== this.currentDocSize.h) {
      this.currentDocSize = { w: doc.widthPx, h: doc.heightPx };
      this.drawCheckerboard(doc.widthPx, doc.heightPx);
      this.docMask.clear().rect(0, 0, doc.widthPx, doc.heightPx).fill(0xffffff);
    }
    if (doc.backgroundColor !== this.currentBg) {
      this.currentBg = doc.backgroundColor;
      this.bgFill.clear();
      if (doc.backgroundColor) {
        this.bgFill.rect(0, 0, doc.widthPx, doc.heightPx).fill(doc.backgroundColor);
      }
    }

    // Reconcile layers.
    const seen = new Set<string>();
    for (let i = 0; i < doc.layers.length; i++) {
      const layer = doc.layers[i];
      seen.add(layer.id);
      let node = this.nodes.get(layer.id);
      if (!node) {
        node = await this.createNode(layer);
        this.nodes.set(layer.id, node);
        this.layersRoot.addChild(node.display);
      } else {
        await this.updateNode(node, layer);
      }
      // ensure correct z-order
      this.layersRoot.setChildIndex(node.display as ContainerChild, i);
    }
    // remove gone nodes
    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        this.layersRoot.removeChild(node.display);
        node.display.destroy();
        this.nodes.delete(id);
      }
    }
  }

  private drawCheckerboard(w: number, h: number) {
    const cell = 16;
    const g = this.checkerboard;
    g.clear();
    // cheap two-color tile by drawing rects per cell — small docs only matter in dev.
    // For very large docs we'd use a tiling sprite; this is OK for typical use.
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const dark = ((x / cell) ^ (y / cell)) & 1;
        g.rect(x, y, cell, cell).fill(dark ? 0x2b2d31 : 0x383a40);
      }
    }
  }

  private async createNode(layer: Layer): Promise<LayerNode> {
    if (layer.type === 'image') {
      const tex = await this.loadTexture(layer.src);
      const s = new Sprite(tex);
      s.eventMode = 'static';
      this.applyCommon(s, layer);
      return { layer, display: s, textureKey: layer.src };
    }
    const t = new Text({
      text: (layer as TextLayer).text,
      style: this.textStyleFor(layer as TextLayer),
    });
    t.eventMode = 'static';
    this.applyCommon(t, layer);
    return { layer, display: t };
  }

  private async updateNode(node: LayerNode, layer: Layer) {
    if (layer.type === 'image' && node.display instanceof Sprite) {
      const il = layer as ImageLayer;
      if (node.textureKey !== il.src) {
        const tex = await this.loadTexture(il.src);
        node.display.texture = tex;
        node.textureKey = il.src;
      }
    } else if (layer.type === 'text' && node.display instanceof Text) {
      const tl = layer as TextLayer;
      if (node.display.text !== tl.text) node.display.text = tl.text;
      node.display.style = this.textStyleFor(tl) as any;
    }
    this.applyCommon(node.display, layer);
    node.layer = layer;
  }

  private applyCommon(d: Sprite | Text, layer: Layer) {
    d.position.set(layer.x + layer.width / 2, layer.y + layer.height / 2);
    d.anchor?.set(0.5);
    if (d instanceof Sprite) {
      d.width = layer.width;
      d.height = layer.height;
    } else {
      // Text: scale to match width/height
      const naturalW = (d as Text).width || 1;
      const naturalH = (d as Text).height || 1;
      d.scale.set(layer.width / naturalW, layer.height / naturalH);
    }
    d.rotation = layer.rotation;
    d.alpha = layer.opacity;
    d.visible = layer.visible;
    (d as any).blendMode = layer.blendMode;
    d.filters = buildFilters(layer.effects) as any;
  }

  private textStyleFor(layer: TextLayer) {
    return {
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: String(layer.fontWeight) as any,
      fill: layer.color,
      align: layer.align,
      wordWrap: false,
    };
  }

  private textureCache = new Map<string, Promise<Texture>>();
  private async loadTexture(src: string): Promise<Texture> {
    let p = this.textureCache.get(src);
    if (!p) {
      p = Assets.load<Texture>(src);
      this.textureCache.set(src, p);
    }
    return p;
  }

  /** Hit-test the topmost layer at doc-space (x, y). */
  hitTestDocPoint(docX: number, docY: number): string | null {
    const layers = Array.from(this.nodes.entries());
    // top of layersRoot is end of array
    for (let i = layers.length - 1; i >= 0; i--) {
      const [id, node] = layers[i];
      if (!node.layer.visible || node.layer.locked) continue;
      // local point relative to layer center
      const cx = node.layer.x + node.layer.width / 2;
      const cy = node.layer.y + node.layer.height / 2;
      const dx = docX - cx;
      const dy = docY - cy;
      const c = Math.cos(-node.layer.rotation);
      const s = Math.sin(-node.layer.rotation);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (
        lx >= -node.layer.width / 2 &&
        lx <= node.layer.width / 2 &&
        ly >= -node.layer.height / 2 &&
        ly <= node.layer.height / 2
      ) {
        return id;
      }
    }
    return null;
  }

  /** Get a snapshot canvas at scale, optionally without checkerboard. */
  extractDocCanvas(scale: number, transparent: boolean): HTMLCanvasElement {
    const wasCheckerVisible = this.checkerboard.visible;
    const wasOverlayVisible = this.overlayRoot.visible;
    const wasBgVisible = this.bgFill.visible;
    this.checkerboard.visible = false;
    this.overlayRoot.visible = false;
    if (transparent) this.bgFill.visible = false;

    const region = new Rectangle(0, 0, this.currentDocSize.w, this.currentDocSize.h);
    const canvas = this.app.renderer.extract.canvas({
      target: this.docRoot,
      frame: region,
      resolution: scale,
      clearColor: transparent ? 0x00000000 : undefined,
    }) as HTMLCanvasElement;

    this.checkerboard.visible = wasCheckerVisible;
    this.overlayRoot.visible = wasOverlayVisible;
    this.bgFill.visible = wasBgVisible;
    return canvas;
  }
}
