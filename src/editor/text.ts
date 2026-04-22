/**
 * Measure a single- or multi-line text string at scale 1 in CSS pixels.
 * Uses an offscreen 2D canvas (created lazily and reused).
 */
export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: text.length * fontSize * 0.6, height: fontSize * 1.25 };
  }
  const cache = (measureText as any)._c as HTMLCanvasElement | undefined;
  const canvas = cache ?? ((measureText as any)._c = document.createElement('canvas'));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const lines = text.length === 0 ? [''] : text.split('\n');
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line || ' ').width);
  // 1.25 line-height matches Pixi default reasonably well.
  const lineHeight = fontSize * 1.25;
  return { width: Math.max(1, Math.ceil(maxW)), height: Math.ceil(lineHeight * lines.length) };
}
