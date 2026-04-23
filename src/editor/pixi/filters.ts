import { BlurFilter, ColorMatrixFilter, NoiseFilter, type Filter } from 'pixi.js';
import {
  DropShadowFilter,
  ConvolutionFilter,
  PixelateFilter,
  AdjustmentFilter,
} from 'pixi-filters';
import type { Effect } from '../types';

const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '');
  const v = parseInt(
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m,
    16,
  );
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const hexToNumber = (hex: string): number => {
  const m = hex.replace('#', '');
  const v = parseInt(
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m,
    16,
  );
  return v;
};

/**
 * Build the Pixi filter chain for a layer's effects, in order.
 * Returns null if no enabled effects.
 */
export function buildFilters(effects: Effect[]): Filter[] | null {
  const filters: Filter[] = [];
  for (const eff of effects) {
    if (!eff.enabled) continue;
    const f = filterFor(eff);
    if (f) filters.push(...(Array.isArray(f) ? f : [f]));
  }
  return filters.length ? filters : null;
}

function filterFor(eff: Effect): Filter | Filter[] | null {
  switch (eff.kind) {
    case 'brightnessContrast': {
      const cm = new ColorMatrixFilter();
      // brightness in 0..2, contrast in -1..1 mapped from -1..1 inputs
      cm.brightness(1 + eff.params.brightness, false);
      cm.contrast(eff.params.contrast, true);
      return cm;
    }
    case 'hsl': {
      const cm = new ColorMatrixFilter();
      cm.hue(eff.params.hue, false);
      cm.saturate(eff.params.saturation, true);
      cm.brightness(1 + eff.params.lightness, true);
      return cm;
    }
    case 'saturation': {
      // amount in -1..1 maps to saturation 0..2 (0 = grayscale, 1 = unchanged, 2 = boosted)
      return new AdjustmentFilter({ saturation: 1 + eff.params.amount });
    }
    case 'colorBalance': {
      // Each axis in -1..1. Positive cyanRed boosts red, negative boosts cyan (reduces red).
      // Implemented as RGB channel multipliers via AdjustmentFilter.
      const k = 0.5;
      return new AdjustmentFilter({
        red: Math.max(0, 1 + k * eff.params.cyanRed),
        green: Math.max(0, 1 + k * eff.params.magentaGreen),
        blue: Math.max(0, 1 + k * eff.params.yellowBlue),
      });
    }
    case 'levels': {
      // Compose: input remap -> gamma -> output remap.
      const filters: Filter[] = [];
      const iB = eff.params.inputBlack;
      const iW = eff.params.inputWhite;
      const oB = eff.params.outputBlack;
      const oW = eff.params.outputWhite;

      // Input remap: ((c - iB) / (iW - iB)).
      const span = Math.max(1e-4, iW - iB);
      const sIn = 1 / span;
      const tIn = -iB * sIn;
      if (sIn !== 1 || tIn !== 0) {
        const cm = new ColorMatrixFilter();
        cm.matrix = [sIn, 0, 0, 0, tIn, 0, sIn, 0, 0, tIn, 0, 0, sIn, 0, tIn, 0, 0, 0, 1, 0] as any;
        filters.push(cm);
      }

      // Gamma (1/gamma in shader: AdjustmentFilter applies pow(color, 1/uGamma))
      const g = Math.max(0.01, eff.params.gamma);
      if (g !== 1) {
        filters.push(new AdjustmentFilter({ gamma: g }));
      }

      // Output remap: oB + c * (oW - oB).
      const sOut = oW - oB;
      if (sOut !== 1 || oB !== 0) {
        const cm = new ColorMatrixFilter();
        cm.matrix = [sOut, 0, 0, 0, oB, 0, sOut, 0, 0, oB, 0, 0, sOut, 0, oB, 0, 0, 0, 1, 0] as any;
        filters.push(cm);
      }

      return filters.length ? filters : null;
    }
    case 'blackAndWhite': {
      // Channel mixer: gray = r*R + g*G + b*B; output = mix(rgb, gray, amount).
      const r = eff.params.red;
      const g = eff.params.green;
      const b = eff.params.blue;
      const a = Math.max(0, Math.min(1, eff.params.amount));
      const ia = 1 - a;
      const cm = new ColorMatrixFilter();
      cm.matrix = [
        ia + a * r,
        a * g,
        a * b,
        0,
        0,
        a * r,
        ia + a * g,
        a * b,
        0,
        0,
        a * r,
        a * g,
        ia + a * b,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
      ] as any;
      return cm;
    }
    case 'blur': {
      const f = new BlurFilter({ strength: eff.params.strength, quality: eff.params.quality });
      return f;
    }
    case 'dropShadow': {
      return new DropShadowFilter({
        offset: {
          x: Math.cos(eff.params.angle) * eff.params.distance,
          y: Math.sin(eff.params.angle) * eff.params.distance,
        },
        blur: eff.params.blur,
        alpha: eff.params.alpha,
        color: hexToNumber(eff.params.color),
      });
    }
    case 'invert': {
      const cm = new ColorMatrixFilter();
      cm.negative(false);
      cm.alpha = eff.params.amount;
      return cm;
    }
    case 'grayscale': {
      const cm = new ColorMatrixFilter();
      cm.grayscale(1 - eff.params.amount, false);
      return cm;
    }
    case 'sepia': {
      const cm = new ColorMatrixFilter();
      cm.sepia(false);
      cm.alpha = eff.params.amount;
      return cm;
    }
    case 'sharpen': {
      // Standard 3x3 sharpen kernel scaled by amount.
      const a = eff.params.amount;
      // matrix: [0,-a,0, -a,1+4a,-a, 0,-a,0]
      const k = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
      return new ConvolutionFilter({ matrix: k as unknown as Float32Array, width: 3, height: 3 });
    }
    case 'noise': {
      return new NoiseFilter({ noise: eff.params.amount, seed: eff.params.seed });
    }
    case 'pixelate': {
      return new PixelateFilter(Math.max(1, eff.params.size));
    }
    case 'tint': {
      const [r, g, b] = hexToRgb(eff.params.color);
      const a = eff.params.amount;
      const ia = 1 - a;
      // Multiply tint via color matrix: blend each channel with the tint color.
      const cm = new ColorMatrixFilter();
      // matrix is 5x4 row-major
      cm.matrix = [
        ia,
        0,
        0,
        0,
        (r / 255) * a,
        0,
        ia,
        0,
        0,
        (g / 255) * a,
        0,
        0,
        ia,
        0,
        (b / 255) * a,
        0,
        0,
        0,
        1,
        0,
      ] as any;
      return cm;
    }
  }
}
