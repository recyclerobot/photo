// Editor data model.
//
// Conceptual model:
//  - A `Layer` is a generic *container* with its own visibility, lock,
//    opacity and blend mode. Layers live in `doc.layers` (bottom-up order).
//  - Each layer owns an ordered list of `LayerObject`s — the actual drawables
//    (image, text, shape). Each object has its own transform, opacity, blend
//    mode, visibility, lock, and effects, and composes under its parent
//    layer's properties.

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type EffectKind =
  | 'brightnessContrast'
  | 'hsl'
  | 'saturation'
  | 'colorBalance'
  | 'levels'
  | 'blackAndWhite'
  | 'blur'
  | 'dropShadow'
  | 'invert'
  | 'grayscale'
  | 'sepia'
  | 'sharpen'
  | 'noise'
  | 'pixelate'
  | 'tint';

export interface EffectBase<K extends EffectKind, P> {
  id: string;
  kind: K;
  enabled: boolean;
  params: P;
}

export type Effect =
  | EffectBase<'brightnessContrast', { brightness: number; contrast: number }>
  | EffectBase<'hsl', { hue: number; saturation: number; lightness: number }>
  | EffectBase<'saturation', { amount: number }>
  | EffectBase<'colorBalance', { cyanRed: number; magentaGreen: number; yellowBlue: number }>
  | EffectBase<
      'levels',
      {
        inputBlack: number;
        inputWhite: number;
        gamma: number;
        outputBlack: number;
        outputWhite: number;
      }
    >
  | EffectBase<'blackAndWhite', { red: number; green: number; blue: number; amount: number }>
  | EffectBase<'blur', { strength: number; quality: number }>
  | EffectBase<
      'dropShadow',
      { distance: number; angle: number; blur: number; alpha: number; color: string }
    >
  | EffectBase<'invert', { amount: number }>
  | EffectBase<'grayscale', { amount: number }>
  | EffectBase<'sepia', { amount: number }>
  | EffectBase<'sharpen', { amount: number }>
  | EffectBase<'noise', { amount: number; seed: number }>
  | EffectBase<'pixelate', { size: number }>
  | EffectBase<'tint', { color: string; amount: number }>;

export interface BaseObject {
  id: string;
  name: string;
  type: 'image' | 'text' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // radians
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  effects: Effect[];
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'line' | 'empty';

export interface ShapeObject extends BaseObject {
  type: 'shape';
  shape: ShapeKind;
  /** null = no fill */
  fillColor: string | null;
  /** null = no stroke */
  strokeColor: string | null;
  strokeWidth: number;
  /** Corner radius for rectangles (px). */
  cornerRadius: number;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  /** Object URL or data URL for the loaded image. */
  src: string;
  /** Original natural dimensions, used for aspect lock. */
  naturalWidth: number;
  naturalHeight: number;
}

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
}

export type LayerObject = ImageObject | TextObject | ShapeObject;

/** Generic container: holds a collection of drawable objects. */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Bottom-up order: index 0 renders behind, last renders in front. */
  objects: LayerObject[];
}

export interface Guide {
  axis: 'v' | 'h';
  /** doc-space position along the perpendicular axis */
  pos: number;
}

export interface CanvasDoc {
  widthPx: number;
  heightPx: number;
  /** null = transparent */
  backgroundColor: string | null;
  layers: Layer[];
  /** User-created ruler guides (Photoshop-style). */
  guides: Guide[];
}

export interface ViewState {
  zoom: number; // 1 = 100%
  panX: number; // screen-space offset of doc center
  panY: number;
}

export const DEFAULT_DOC: CanvasDoc = {
  widthPx: 1024,
  heightPx: 768,
  backgroundColor: null,
  layers: [],
  guides: [],
};
