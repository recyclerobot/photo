import { useEffect } from 'react';
import { importImageFiles } from '../editor/export';

/** Window-wide drag-and-drop for image files. */
export function useDropzone() {
  useEffect(() => {
    let depth = 0;
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;pointer-events:none;border:3px dashed #5865f2;background:rgba(88,101,242,0.08);display:none;';
    document.body.appendChild(overlay);

    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      overlay.style.display = 'block';
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) overlay.style.display = 'none';
    };
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      overlay.style.display = 'none';
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      void importImageFiles(e.dataTransfer.files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      overlay.remove();
    };
  }, []);
}
