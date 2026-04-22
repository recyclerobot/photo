// Editor data model.

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type EffectKind =
  | 'brightnessContrast'
  | 'hsl'
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

export interface BaseLayer {
  id: string;
  name: string;
  type: 'image' | 'text';
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

export interface ImageLayer extends BaseLayer {
  type: 'image';
  /** Object URL for the loaded image. Owned by the layer; revoked on remove. */
  src: string;
  /** Original natural dimensions, used for aspect lock. */
  naturalWidth: number;
  naturalHeight: number;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
}

export type Layer = ImageLayer | TextLayer;

export interface CanvasDoc {
  widthPx: number;
  heightPx: number;
  /** null = transparent */
  backgroundColor: string | null;
  layers: Layer[];
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
};
