import { Graphics, Container } from 'pixi.js';

const COLOR = 0xff3b8b;

export interface GuideLine {
  /** 'v' = vertical line at x, 'h' = horizontal line at y */
  axis: 'v' | 'h';
  /** Position in doc space along the line's perpendicular axis. */
  pos: number;
  /** Doc-space extent (start..end) along the line's axis. */
  start: number;
  end: number;
}

/**
 * Renders smart-guide lines in doc space. Drawn on the overlayRoot so the
 * guides remain crisp at any zoom (we scale stroke width by inverseZoom).
 */
export class SnapGuides {
  container: Container;
  private g = new Graphics();

  constructor() {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.container.addChild(this.g);
    this.container.visible = false;
  }

  hide() {
    this.container.visible = false;
    this.g.clear();
  }

  draw(lines: GuideLine[], inverseZoom: number) {
    this.g.clear();
    if (lines.length === 0) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;
    const w = 1 * inverseZoom;
    for (const l of lines) {
      if (l.axis === 'v') {
        this.g.moveTo(l.pos, l.start).lineTo(l.pos, l.end);
      } else {
        this.g.moveTo(l.start, l.pos).lineTo(l.end, l.pos);
      }
    }
    this.g.stroke({ width: w, color: COLOR, alpha: 0.95 });
  }
}
