import type { CanvasDoc, Layer, LayerObject, BlendMode } from './types';

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Bring an arbitrary doc snapshot up to the current schema, where each
 * `Layer` is a generic container holding zero or more drawable
 * `LayerObject`s.
 *
 * The legacy schema represented each drawable as a `Layer` with a `type`
 * field. We detect that shape and wrap each old layer as a single-object
 * container, preserving its visibility/lock/opacity/blend on the wrapping
 * layer (so the layer panel feels familiar) while moving the drawable's
 * geometry/effects onto a child object.
 */
export function migrateDoc(input: unknown): CanvasDoc {
  const raw = (input ?? {}) as Partial<CanvasDoc> & Record<string, unknown>;
  const widthPx = typeof raw.widthPx === 'number' ? raw.widthPx : 1024;
  const heightPx = typeof raw.heightPx === 'number' ? raw.heightPx : 768;
  const backgroundColor =
    raw.backgroundColor === null || typeof raw.backgroundColor === 'string'
      ? raw.backgroundColor
      : null;
  const guides = Array.isArray(raw.guides) ? raw.guides : [];

  const rawLayers = Array.isArray(raw.layers) ? (raw.layers as unknown[]) : [];
  const layers: Layer[] = rawLayers.map((entry) => migrateLayer(entry));

  return { widthPx, heightPx, backgroundColor, layers, guides };
}

function migrateLayer(entry: unknown): Layer {
  const raw = (entry ?? {}) as Record<string, unknown>;

  // New-format layer: has `objects` array and no `type` field.
  if (Array.isArray(raw.objects) && typeof raw.type !== 'string') {
    return {
      id: stringOr(raw.id, uid()),
      name: stringOr(raw.name, 'Layer'),
      visible: boolOr(raw.visible, true),
      locked: boolOr(raw.locked, false),
      opacity: numOr(raw.opacity, 1),
      blendMode: blendOr(raw.blendMode),
      objects: (raw.objects as unknown[])
        .map((o) => migrateObject(o))
        .filter(Boolean) as LayerObject[],
    };
  }

  // Legacy-format: this entry IS a drawable. Wrap it in a single-object layer.
  const obj = migrateObject(raw);
  return {
    id: stringOr(raw.id, uid()) + '-l',
    name: stringOr(raw.name, obj?.name ?? 'Layer'),
    visible: boolOr(raw.visible, true),
    locked: boolOr(raw.locked, false),
    // Keep all visual modifiers on the *object* (so they continue to apply),
    // and keep the wrapping layer fully transparent-of-effects: opacity 1,
    // blend normal. This avoids double-applying things like opacity.
    opacity: 1,
    blendMode: 'normal',
    objects: obj ? [obj] : [],
  };
}

function migrateObject(entry: unknown): LayerObject | null {
  const raw = (entry ?? {}) as Record<string, unknown>;
  const type = raw.type;
  if (type !== 'image' && type !== 'text' && type !== 'shape') return null;

  const base = {
    id: stringOr(raw.id, uid()),
    name: stringOr(raw.name, type[0].toUpperCase() + type.slice(1)),
    x: numOr(raw.x, 0),
    y: numOr(raw.y, 0),
    width: numOr(raw.width, 100),
    height: numOr(raw.height, 100),
    rotation: numOr(raw.rotation, 0),
    opacity: numOr(raw.opacity, 1),
    visible: boolOr(raw.visible, true),
    locked: boolOr(raw.locked, false),
    blendMode: blendOr(raw.blendMode),
    effects: Array.isArray(raw.effects) ? (raw.effects as LayerObject['effects']) : [],
  };

  if (type === 'image') {
    return {
      ...base,
      type: 'image',
      src: stringOr(raw.src, ''),
      naturalWidth: numOr(raw.naturalWidth, base.width),
      naturalHeight: numOr(raw.naturalHeight, base.height),
    };
  }
  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      text: stringOr(raw.text, 'Text'),
      fontFamily: stringOr(raw.fontFamily, 'Inter, system-ui, sans-serif'),
      fontSize: numOr(raw.fontSize, 64),
      fontWeight: numOr(raw.fontWeight, 600),
      color: stringOr(raw.color, '#ffffff'),
      align: (raw.align as 'left' | 'center' | 'right') ?? 'left',
      lineHeight: numOr(raw.lineHeight, 1.25),
      letterSpacing: numOr(raw.letterSpacing, 0),
    };
  }
  return {
    ...base,
    type: 'shape',
    shape: (raw.shape as 'rectangle' | 'ellipse' | 'triangle' | 'line' | 'empty') ?? 'rectangle',
    fillColor:
      typeof raw.fillColor === 'string' || raw.fillColor === null
        ? (raw.fillColor as string | null)
        : '#5865f2',
    strokeColor:
      typeof raw.strokeColor === 'string' || raw.strokeColor === null
        ? (raw.strokeColor as string | null)
        : null,
    strokeWidth: numOr(raw.strokeWidth, 0),
    cornerRadius: numOr(raw.cornerRadius, 0),
  };
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}
function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function blendOr(v: unknown): BlendMode {
  const allowed: BlendMode[] = [
    'normal',
    'add',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
  ];
  return (allowed as string[]).includes(v as string) ? (v as BlendMode) : 'normal';
}
