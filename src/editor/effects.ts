import type { Effect, EffectKind } from './types';

export const EFFECT_LABELS: Record<EffectKind, string> = {
  brightnessContrast: 'Brightness / Contrast',
  hsl: 'Hue / Saturation / Lightness',
  blur: 'Gaussian Blur',
  dropShadow: 'Drop Shadow',
  invert: 'Invert',
  grayscale: 'Grayscale',
  sepia: 'Sepia',
  sharpen: 'Sharpen',
  noise: 'Noise',
  pixelate: 'Pixelate',
  tint: 'Color Tint',
};

export const ALL_EFFECT_KINDS: EffectKind[] = [
  'brightnessContrast',
  'hsl',
  'blur',
  'dropShadow',
  'invert',
  'grayscale',
  'sepia',
  'sharpen',
  'noise',
  'pixelate',
  'tint',
];

export function defaultEffectFor(kind: EffectKind, id: string): Effect {
  switch (kind) {
    case 'brightnessContrast':
      return { id, kind, enabled: true, params: { brightness: 0, contrast: 0 } };
    case 'hsl':
      return { id, kind, enabled: true, params: { hue: 0, saturation: 0, lightness: 0 } };
    case 'blur':
      return { id, kind, enabled: true, params: { strength: 8, quality: 4 } };
    case 'dropShadow':
      return {
        id,
        kind,
        enabled: true,
        params: { distance: 8, angle: Math.PI / 4, blur: 6, alpha: 0.5, color: '#000000' },
      };
    case 'invert':
      return { id, kind, enabled: true, params: { amount: 1 } };
    case 'grayscale':
      return { id, kind, enabled: true, params: { amount: 1 } };
    case 'sepia':
      return { id, kind, enabled: true, params: { amount: 1 } };
    case 'sharpen':
      return { id, kind, enabled: true, params: { amount: 0.5 } };
    case 'noise':
      return { id, kind, enabled: true, params: { amount: 0.2, seed: Math.random() } };
    case 'pixelate':
      return { id, kind, enabled: true, params: { size: 8 } };
    case 'tint':
      return { id, kind, enabled: true, params: { color: '#ff0066', amount: 0.5 } };
  }
}
