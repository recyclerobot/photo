import { describe, it, expect, beforeEach, vi } from 'vitest';

// Spy on measureText to verify when the store re-measures text objects.
vi.mock('../text', () => ({
  measureText: vi.fn(() => ({ width: 100, height: 50 })),
}));

import { useEditor } from '../store';
import { measureText } from '../text';

const s = () => useEditor.getState();

beforeEach(() => {
  useEditor.setState({
    doc: { widthPx: 800, heightPx: 600, backgroundColor: null, layers: [], guides: [] },
    past: [],
    future: [],
    selectedLayerId: null,
    selectedObjectId: null,
    additionalSelectedObjectIds: [],
  });
  vi.mocked(measureText).mockClear();
});

describe('text re-measure', () => {
  it('does NOT re-measure on transform-only patches (drag ticks)', () => {
    const id = s().addTextObject('hello');
    vi.mocked(measureText).mockClear();

    s().updateObject(id, { x: 10, y: 20 });
    s().updateObject(id, { rotation: 0.5 });
    s().updateObject(id, { opacity: 0.7 });
    expect(measureText).not.toHaveBeenCalled();
  });

  it('re-measures when text or metric fields change', () => {
    const id = s().addTextObject('hello');
    vi.mocked(measureText).mockClear();

    s().updateObject(id, { text: 'world' });
    expect(measureText).toHaveBeenCalledTimes(1);

    s().updateObject(id, { fontSize: 32 });
    expect(measureText).toHaveBeenCalledTimes(2);

    s().updateObject(id, { lineHeight: 2 });
    expect(measureText).toHaveBeenCalledTimes(3);

    s().updateObject(id, { letterSpacing: 4 });
    expect(measureText).toHaveBeenCalledTimes(4);
  });

  it('re-derives width/height when patched directly (text size is derived)', () => {
    const id = s().addTextObject('hello');
    vi.mocked(measureText).mockClear();

    s().updateObject(id, { width: 999 });
    expect(measureText).toHaveBeenCalledTimes(1);
    const obj = s().doc.layers[0].objects.find((o) => o.id === id)!;
    expect(obj.width).toBe(100); // mocked measure wins, not the patch
  });
});
