import {
  Application,
  Container,
  Sprite,
  Text,
  Texture,
  Graphics,
  Assets,
  Rectangle,
} from 'pixi.js';
import type { Filter } from 'pixi.js';
import type { CanvasDoc, ImageObject, Layer, LayerObject, ShapeObject, TextObject } from '../types';
import { buildFilters } from './filters';

interface ObjectNode {
  object: LayerObject;
  display: Sprite | Text | Graphics;
  textureKey?: string;
  shapeSig?: string;
}

interface LayerNode {
  layer: Layer;
  container: Container;
  nodes: Map<string, ObjectNode>;
}

/**
 * Owns a Pixi Application + the document scene graph and reconciles it with
 * the editor store on every change. The scene mirrors the store's two-level
 * structure: each `Layer` becomes a `Container` whose children are
 * per-object `Sprite`/`Text`/`Graphics` displays.
 */
export class PixiScene {
  app: Application;
  worldRoot: Container;
  docRoot: Container;
  checkerboard: Graphics;
  bgFill: Graphics;
  layersRoot: Container;
  overlayRoot: Container;

  private layerNodes = new Map<string, LayerNode>();
  private currentDocSize = { w: 0, h: 0 };
  private currentBg: string | null = null;
  private editingId: string | null = null;

  /** Hide the Pixi display for a single object being edited via HTML overlay. */
  setEditingId(id: string | null) {
    if (this.editingId === id) return;
    const prev = this.editingId;
    this.editingId = id;
    if (prev) {
      const n = this.findObjectNode(prev);
      if (n) n.display.visible = n.object.visible;
    }
    if (id) {
      const n = this.findObjectNode(id);
      if (n) n.display.visible = false;
    }
  }

  private findObjectNode(objectId: string): ObjectNode | undefined {
    for (const ln of this.layerNodes.values()) {
      const n = ln.nodes.get(objectId);
      if (n) return n;
    }
    return undefined;
  }

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

    this.applyDocMask();
  }

  private docMask = new Graphics();
  private applyDocMask() {
    this.docRoot.addChild(this.docMask);
    this.docRoot.mask = this.docMask;
  }

  setView(zoom: number, panX: number, panY: number, screenW: number, screenH: number) {
    this.worldRoot.scale.set(zoom);
    const cx = screenW / 2 - (this.currentDocSize.w * zoom) / 2 + panX;
    const cy = screenH / 2 - (this.currentDocSize.h * zoom) / 2 + panY;
    this.worldRoot.position.set(cx, cy);
  }

  async syncDoc(doc: CanvasDoc) {
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
    const seenLayers = new Set<string>();
    for (let i = 0; i < doc.layers.length; i++) {
      const layer = doc.layers[i];
      seenLayers.add(layer.id);
      let ln = this.layerNodes.get(layer.id);
      if (!ln) {
        ln = {
          layer,
          container: new Container(),
          nodes: new Map(),
        };
        this.layerNodes.set(layer.id, ln);
        this.layersRoot.addChild(ln.container);
      }
      ln.layer = layer;
      ln.container.alpha = layer.opacity;
      ln.container.visible = layer.visible;
      (ln.container as unknown as { blendMode: string }).blendMode = layer.blendMode;
      // ensure correct z-order
      this.layersRoot.setChildIndex(ln.container, i);

      // Reconcile child objects in this layer.
      const seenObjects = new Set<string>();
      for (let j = 0; j < layer.objects.length; j++) {
        const obj = layer.objects[j];
        seenObjects.add(obj.id);
        let on = ln.nodes.get(obj.id);
        if (!on) {
          on = await this.createObjectNode(obj);
          ln.nodes.set(obj.id, on);
          ln.container.addChild(on.display);
        } else {
          await this.updateObjectNode(on, obj);
          // move container if the object was reparented since last sync
          if (on.display.parent !== ln.container) {
            on.display.parent?.removeChild(on.display);
            ln.container.addChild(on.display);
          }
        }
        ln.container.setChildIndex(on.display, j);
      }
      for (const [objId, on] of ln.nodes) {
        if (!seenObjects.has(objId)) {
          ln.container.removeChild(on.display);
          on.display.destroy();
          ln.nodes.delete(objId);
        }
      }
    }
    for (const [layerId, ln] of this.layerNodes) {
      if (!seenLayers.has(layerId)) {
        for (const on of ln.nodes.values()) on.display.destroy();
        this.layersRoot.removeChild(ln.container);
        ln.container.destroy({ children: true });
        this.layerNodes.delete(layerId);
      }
    }
  }

  private drawCheckerboard(w: number, h: number) {
    const cell = 16;
    const g = this.checkerboard;
    g.clear();
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const dark = ((x / cell) ^ (y / cell)) & 1;
        g.rect(x, y, cell, cell).fill(dark ? 0x2b2d31 : 0x383a40);
      }
    }
  }

  private async createObjectNode(obj: LayerObject): Promise<ObjectNode> {
    if (obj.type === 'image') {
      const tex = await this.loadTexture(obj.src);
      const s = new Sprite(tex);
      s.eventMode = 'static';
      s.anchor.set(0.5);
      const node: ObjectNode = { object: obj, display: s, textureKey: obj.src };
      this.applyObjectCommon(node, obj);
      return node;
    }
    if (obj.type === 'shape') {
      const g = new Graphics();
      g.eventMode = 'static';
      g.pivot.set(0.5, 0.5);
      const node: ObjectNode = { object: obj, display: g };
      this.applyObjectCommon(node, obj);
      return node;
    }
    const tl = obj as TextObject;
    const t = new Text({
      text: tl.text,
      style: this.textStyleFor(tl),
    });
    t.eventMode = 'static';
    t.anchor.set(0.5);
    const node: ObjectNode = { object: obj, display: t };
    this.applyObjectCommon(node, obj);
    return node;
  }

  private async updateObjectNode(node: ObjectNode, obj: LayerObject) {
    if (obj.type === 'image' && node.display instanceof Sprite) {
      const il = obj as ImageObject;
      if (node.textureKey !== il.src) {
        const tex = await this.loadTexture(il.src);
        node.display.texture = tex;
        node.textureKey = il.src;
      }
    } else if (obj.type === 'text' && node.display instanceof Text) {
      const tl = obj as TextObject;
      const prev = node.object as TextObject;
      const styleChanged =
        prev.text !== tl.text ||
        prev.fontFamily !== tl.fontFamily ||
        prev.fontSize !== tl.fontSize ||
        prev.fontWeight !== tl.fontWeight ||
        prev.color !== tl.color ||
        prev.align !== tl.align ||
        prev.lineHeight !== tl.lineHeight ||
        prev.letterSpacing !== tl.letterSpacing;
      if (styleChanged) {
        if (node.display.text !== tl.text) node.display.text = tl.text;
        node.display.style = this.textStyleFor(tl) as unknown as Text['style'];
      }
    }
    this.applyObjectCommon(node, obj);
    node.object = obj;
  }

  private applyObjectCommon(node: ObjectNode, obj: LayerObject) {
    const d = node.display;
    d.position.set(obj.x + obj.width / 2, obj.y + obj.height / 2);
    d.rotation = obj.rotation;
    d.alpha = obj.opacity;
    d.visible = obj.visible && this.editingId !== obj.id;
    (d as unknown as { blendMode: string }).blendMode = obj.blendMode;
    const filters = buildFilters(obj.effects);
    (d as unknown as { filters: Filter[] | null }).filters = filters ? [...filters] : null;

    if (d instanceof Sprite) {
      d.width = obj.width;
      d.height = obj.height;
    } else if (d instanceof Text) {
      d.scale.set(1, 1);
    } else if (d instanceof Graphics) {
      this.drawShape(node, d, obj as ShapeObject);
    }
  }

  private drawShape(node: ObjectNode, g: Graphics, obj: ShapeObject) {
    const sig = `${obj.shape}|${obj.width}|${obj.height}|${obj.fillColor}|${obj.strokeColor}|${obj.strokeWidth}|${obj.cornerRadius}`;
    if (node.shapeSig === sig) return;
    node.shapeSig = sig;

    g.clear();
    const w = obj.width;
    const h = obj.height;
    const hw = w / 2;
    const hh = h / 2;

    switch (obj.shape) {
      case 'rectangle':
        if (obj.cornerRadius > 0) {
          g.roundRect(-hw, -hh, w, h, obj.cornerRadius);
        } else {
          g.rect(-hw, -hh, w, h);
        }
        break;
      case 'ellipse':
        g.ellipse(0, 0, hw, hh);
        break;
      case 'triangle':
        g.poly([0, -hh, hw, hh, -hw, hh]);
        break;
      case 'line':
        g.moveTo(-hw, 0).lineTo(hw, 0);
        break;
      case 'empty':
        return;
    }

    if (obj.fillColor && obj.shape !== 'line') {
      g.fill(obj.fillColor);
    }
    if (obj.strokeColor && obj.strokeWidth > 0) {
      g.stroke({ color: obj.strokeColor, width: obj.strokeWidth, alignment: 0.5 });
    }
  }

  private textStyleFor(layer: TextObject) {
    return {
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: String(layer.fontWeight) as 'normal',
      fill: layer.color,
      align: layer.align,
      // Pixi expects line height in px; the object stores a multiplier.
      lineHeight: layer.fontSize * layer.lineHeight,
      letterSpacing: layer.letterSpacing,
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

  /**
   * Drop cached textures whose src is not in `keep` and free their GPU
   * memory. Callers must include every src reachable from the current doc
   * AND the undo/redo history — anything else may be restored by undo.
   */
  pruneTextureCache(keep: ReadonlySet<string>) {
    for (const src of [...this.textureCache.keys()]) {
      if (keep.has(src)) continue;
      this.textureCache.delete(src);
      // Assets.unload removes from Pixi's cache and destroys the texture.
      void Assets.unload(src).catch(() => {});
    }
  }

  /**
   * Hit-test the topmost object at doc-space (x, y). Returns the object id
   * along with its parent layer id, or null if nothing is hit. Locked or
   * hidden layers/objects are skipped.
   */
  hitTestDocPoint(docX: number, docY: number): { layerId: string; objectId: string } | null {
    // Iterate layers top-most first
    for (let li = this.layersRoot.children.length - 1; li >= 0; li--) {
      const container = this.layersRoot.children[li];
      const layer = [...this.layerNodes.values()].find((ln) => ln.container === container)?.layer;
      if (!layer) continue;
      if (!layer.visible || layer.locked) continue;

      const ln = this.layerNodes.get(layer.id)!;
      // top-most object first
      for (let oi = layer.objects.length - 1; oi >= 0; oi--) {
        const obj = layer.objects[oi];
        if (!obj.visible || obj.locked) continue;
        if (!ln.nodes.get(obj.id)) continue;
        if (pointInObject(docX, docY, obj)) {
          return { layerId: layer.id, objectId: obj.id };
        }
      }
    }
    return null;
  }

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

function pointInObject(docX: number, docY: number, obj: LayerObject): boolean {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const dx = docX - cx;
  const dy = docY - cy;
  const c = Math.cos(-obj.rotation);
  const s = Math.sin(-obj.rotation);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return (
    lx >= -obj.width / 2 && lx <= obj.width / 2 && ly >= -obj.height / 2 && ly <= obj.height / 2
  );
}
