import { describe, it, expect } from 'vitest';
import { migrateDoc } from '../migration';

describe('migrateDoc', () => {
  it('fills text-metric defaults on legacy docs', () => {
    const doc = migrateDoc({
      widthPx: 800,
      heightPx: 600,
      backgroundColor: null,
      layers: [
        {
          id: 'l1',
          name: 'Layer 1',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          objects: [
            {
              id: 't1',
              type: 'text',
              name: 'Text',
              text: 'hello',
              x: 0,
              y: 0,
              width: 100,
              height: 50,
              rotation: 0,
              opacity: 1,
              visible: true,
              locked: false,
              blendMode: 'normal',
              effects: [],
              fontFamily: 'Inter',
              fontSize: 64,
              fontWeight: 600,
              color: '#fff',
              align: 'left',
              // no lineHeight / letterSpacing — pre-2026-06 doc
            },
          ],
        },
      ],
    });

    const obj = doc.layers[0].objects[0];
    expect(obj.type).toBe('text');
    if (obj.type === 'text') {
      expect(obj.lineHeight).toBe(1.25);
      expect(obj.letterSpacing).toBe(0);
    }
  });

  it('survives garbage input without throwing', () => {
    expect(() => migrateDoc(null)).not.toThrow();
    expect(() => migrateDoc({})).not.toThrow();
    expect(() => migrateDoc({ layers: 'nope' })).not.toThrow();
    const doc = migrateDoc({ layers: [{ objects: [{ type: 'banana' }] }] });
    expect(Array.isArray(doc.layers)).toBe(true);
  });
});
