import { getActiveScene } from './pixi/sceneRef';
import { useEditor } from './store';
import { notify } from '../ui/notices';

export interface ExportOptions {
  scale: 1 | 2 | 3;
  transparent: boolean;
  /** Used only when transparent=false; overrides doc bg color. */
  backgroundColor?: string;
}

export async function exportPng(opts: ExportOptions): Promise<void> {
  const scene = getActiveScene();
  if (!scene) throw new Error('Pixi scene not ready');
  const { doc } = useEditor.getState();

  // Temporarily apply override bg if requested.
  const prevBg = doc.backgroundColor;
  if (!opts.transparent && opts.backgroundColor) {
    useEditor.getState().setBackgroundColor(opts.backgroundColor);
    await scene.syncDoc(useEditor.getState().doc);
  }

  try {
    const canvas = scene.extractDocCanvas(opts.scale, opts.transparent);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Failed to encode PNG');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-${doc.widthPx}x${doc.heightPx}@${opts.scale}x.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    if (!opts.transparent && opts.backgroundColor) {
      useEditor.getState().setBackgroundColor(prevBg);
      await scene.syncDoc(useEditor.getState().doc);
    }
  }
}

export async function importImageFiles(files: FileList | File[]): Promise<void> {
  const all = Array.from(files);
  const arr = all.filter((f) => f.type.startsWith('image/'));
  if (arr.length === 0 && all.length > 0) {
    notify('warning', 'No image files found — only image formats can be imported.');
    return;
  }
  const failed: string[] = [];
  for (const file of arr) {
    try {
      // Use data URLs so the image survives reload (blob: URLs are session-scoped).
      const url = await readFileAsDataURL(file);
      const dims = await readImageDimensions(url);
      useEditor.getState().addImageObject(url, dims.width, dims.height, file.name);
    } catch {
      failed.push(file.name);
    }
  }
  if (failed.length > 0) {
    notify('error', `Could not import: ${failed.join(', ')}`);
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}
