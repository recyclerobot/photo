import { useEffect } from 'react';
import { useEditor } from '../editor/store';

const isEditableTarget = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
};

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      const s = useEditor.getState();
      const id = s.selectedLayerId;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'd' && id) {
        e.preventDefault();
        s.duplicateLayer(id);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && id) {
        e.preventDefault();
        s.removeLayer(id);
        return;
      }
      if (e.key === '[' && id) {
        s.reorderLayer(id, -1);
        return;
      }
      if (e.key === ']' && id) {
        s.reorderLayer(id, 1);
        return;
      }
      if (e.key.toLowerCase() === 't' && !meta) {
        e.preventDefault();
        s.addTextLayer();
        return;
      }

      if (id && e.key.startsWith('Arrow')) {
        const layer = s.doc.layers.find((l) => l.id === id);
        if (!layer) return;
        const step = e.shiftKey ? 10 : 1;
        let dx = 0,
          dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        e.preventDefault();
        s.updateLayer(id, { x: layer.x + dx, y: layer.y + dy } as any);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
