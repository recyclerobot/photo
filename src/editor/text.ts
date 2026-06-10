/**
 * Measure a single- or multi-line text string at scale 1 in CSS pixels.
 * Uses an offscreen 2D canvas (created lazily and reused).
 * `lineHeight` is a multiple of font size; `letterSpacing` is in px.
 */
export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  lineHeight = 1.25,
  letterSpacing = 0,
): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: text.length * (fontSize * 0.6 + letterSpacing), height: fontSize * lineHeight };
  }
  const cache = (measureText as any)._c as HTMLCanvasElement | undefined;
  const canvas = cache ?? ((measureText as any)._c = document.createElement('canvas'));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const hasNativeSpacing = 'letterSpacing' in ctx;
  if (hasNativeSpacing) ctx.letterSpacing = `${letterSpacing}px`;
  const lines = text.length === 0 ? [''] : text.split('\n');
  let maxW = 0;
  for (const line of lines) {
    let w = ctx.measureText(line || ' ').width;
    if (!hasNativeSpacing) w += letterSpacing * Math.max(0, line.length - 1);
    maxW = Math.max(maxW, w);
  }
  if (hasNativeSpacing) ctx.letterSpacing = '0px';
  const lineH = fontSize * lineHeight;
  return { width: Math.max(1, Math.ceil(maxW)), height: Math.ceil(lineH * lines.length) };
}
