import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useEditor } from '../store';
import { MAX_CANVAS_PX } from '../types';
import type { TextObject } from '../types';

const resetStore = () => {
  useEditor.setState({
    doc: { widthPx: 800, heightPx: 600, backgroundColor: null, layers: [], guides: [] },
    past: [],
    future: [],
    selectedLayerId: null,
    selectedObjectId: null,
    additionalSelectedObjectIds: [],
  });
};

const s = () => useEditor.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('history', () => {
  it('records one entry per discrete mutation and undo/redo round-trips', () => {
    const id = s().addTextObject('hello');
    expect(s().past.length).toBe(1);

    // Advance beyond the coalescing window so this is a separate step.
    vi.advanceTimersByTime(1000);
    s().updateObject(id, { opacity: 0.5 });
    expect(s().past.length).toBe(2);

    s().undo();
    const obj = s().doc.layers[0].objects[0];
    expect(obj.opacity).toBe(1);

    s().redo();
    expect(s().doc.layers[0].objects[0].opacity).toBe(0.5);
  });

  it('caps history at 50 entries', () => {
    const id = s().addTextObject('x');
    for (let i = 0; i < 80; i++) {
      vi.advanceTimersByTime(1000);
      s().updateObject(id, { opacity: (i % 90) / 100 });
    }
    expect(s().past.length).toBe(50);
  });
});

describe('history coalescing', () => {
  it('collapses rapid same-field updates into one undo step', () => {
    const id = s().addTextObject('hello');
    vi.advanceTimersByTime(1000);
    const before = s().past.length;

    // Simulate a slider drag: many ticks < 300 ms apart.
    for (let i = 1; i <= 10; i++) {
      s().updateObject(id, { opacity: i / 10 });
      vi.advanceTimersByTime(50);
    }
    expect(s().past.length).toBe(before + 1);

    // One undo reverts the whole burst.
    s().undo();
    expect(s().doc.layers[0].objects[0].opacity).toBe(1);
  });

  it('does not coalesce across different fields', () => {
    const id = s().addTextObject('hello');
    vi.advanceTimersByTime(1000);
    const before = s().past.length;

    s().updateObject(id, { opacity: 0.5 });
    s().updateObject(id, { rotation: 1 });
    expect(s().past.length).toBe(before + 2);
  });

  it('does not coalesce after the window has passed', () => {
    const id = s().addTextObject('hello');
    vi.advanceTimersByTime(1000);
    const before = s().past.length;

    s().updateObject(id, { opacity: 0.5 });
    vi.advanceTimersByTime(400);
    s().updateObject(id, { opacity: 0.7 });
    expect(s().past.length).toBe(before + 2);
  });

  it('never coalesces across an undo', () => {
    const id = s().addTextObject('hello');
    vi.advanceTimersByTime(1000);

    s().updateObject(id, { opacity: 0.5 });
    s().undo();
    expect(s().doc.layers[0].objects[0].opacity).toBe(1);

    // Same field, still inside the time window — must be a fresh entry, and
    // undoing it must return to the post-undo state (opacity 1).
    s().updateObject(id, { opacity: 0.9 });
    s().undo();
    expect(s().doc.layers[0].objects[0].opacity).toBe(1);
  });

  it('coalesces interleaved multi-object drags into one step', () => {
    const a = s().addTextObject('a');
    vi.advanceTimersByTime(1000);
    const b = s().addTextObject('b');
    vi.advanceTimersByTime(1000);
    const before = s().past.length;

    // Group drag: per-tick updates interleave object ids with the same fields.
    for (let i = 1; i <= 5; i++) {
      s().updateObject(a, { x: i, y: i });
      s().updateObject(b, { x: i + 100, y: i + 100 });
      vi.advanceTimersByTime(30);
    }
    expect(s().past.length).toBe(before + 1);
  });
});

describe('layer & object reordering', () => {
  it('moveLayerToIndex moves and no-ops on adjacent targets', () => {
    const l1 = s().addLayer('one');
    const l2 = s().addLayer('two');
    const l3 = s().addLayer('three');
    const order = () => s().doc.layers.map((l) => l.id);
    expect(order()).toEqual([l1, l2, l3]);

    s().moveLayerToIndex(l3, 0);
    expect(order()).toEqual([l3, l1, l2]);

    // Moving an item right next to itself must not change anything.
    const before = order();
    const histBefore = s().past.length;
    s().moveLayerToIndex(l3, 1);
    expect(order()).toEqual(before);
    expect(s().past.length).toBe(histBefore + 1); // recorded, doc unchanged

    s().moveLayerToIndex(l1, 3);
    expect(order()).toEqual([l3, l2, l1]);
  });

  it('moveObjectToLayer moves across layers at the requested index', () => {
    const l1 = s().addLayer('one');
    const t1 = s().addTextObject('in-l1');
    const l2 = s().addLayer('two');
    const t2 = s().addTextObject('in-l2');

    const layerOf = (oid: string) =>
      s().doc.layers.find((l) => l.objects.some((o) => o.id === oid))?.id;
    expect(layerOf(t1)).toBe(l1);
    expect(layerOf(t2)).toBe(l2);

    s().moveObjectToLayer(t1, l2, 0);
    expect(layerOf(t1)).toBe(l2);
    expect(
      s()
        .doc.layers.find((l) => l.id === l2)
        ?.objects.map((o) => o.id),
    ).toEqual([t1, t2]);
  });
});

describe('canvas size clamping', () => {
  it('newDoc clamps to MAX_CANVAS_PX', () => {
    s().newDoc(100_000, 0.2, null);
    expect(s().doc.widthPx).toBe(MAX_CANVAS_PX);
    expect(s().doc.heightPx).toBe(1);
  });

  it('setCanvasSize clamps to MAX_CANVAS_PX', () => {
    s().setCanvasSize(99999, 4000);
    expect(s().doc.widthPx).toBe(MAX_CANVAS_PX);
    expect(s().doc.heightPx).toBe(4000);
  });
});

describe('text objects', () => {
  it('get line-height and letter-spacing defaults', () => {
    const id = s().addTextObject('hello');
    const obj = s().doc.layers[0].objects.find((o) => o.id === id) as TextObject;
    expect(obj.lineHeight).toBe(1.25);
    expect(obj.letterSpacing).toBe(0);
  });
});
