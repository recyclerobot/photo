import JSZip from 'jszip';
import { useEditor } from './store';
import { migrateDoc } from './migration';
import type { CanvasDoc, Layer } from './types';
import { notify } from '../ui/notices';

const PROJECT_VERSION = 1;
const ASSETS_DIR = 'assets';

interface ProjectManifest {
  version: number;
  /** Document with image `src` rewritten to relative archive paths. */
  doc: CanvasDoc;
}

/**
 * Bundle the current document + every referenced image asset into a single
 * `.designproj` zip file and trigger a download.
 *
 * The zip layout is:
 *   project.json              JSON manifest (version + doc, image src rewritten)
 *   assets/<id>.<ext>         binary asset payload, one per unique image src
 */
export async function exportProjectZip(): Promise<void> {
  const { doc } = useEditor.getState();
  const zip = new JSZip();

  /** Map original src → archive path so identical images dedupe. */
  const seen = new Map<string, string>();
  const assetsFolder = zip.folder(ASSETS_DIR)!;
  let counter = 0;

  const docCopy: CanvasDoc = {
    ...doc,
    layers: doc.layers.map((layer) => ({
      ...layer,
      objects: layer.objects.map((obj) => {
        if (obj.type !== 'image') return { ...obj };
        const existing = seen.get(obj.src);
        if (existing) return { ...obj, src: existing };
        const archivePath = encodeAssetForZip(obj.src, obj.name, counter++, assetsFolder);
        seen.set(obj.src, archivePath);
        return { ...obj, src: archivePath };
      }),
    })),
  };

  const manifest: ProjectManifest = { version: PROJECT_VERSION, doc: docCopy };
  zip.file('project.json', JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFor(doc);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open a previously-exported `.designproj` zip and replace the current doc.
 * Asset files referenced from `project.json` are inlined back as data URLs
 * (so the resulting in-memory doc behaves identically to one with embedded
 * images, including persisting through the library).
 */
export async function importProjectZip(file: File): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('project.json');
  if (!manifestFile) throw new Error('Invalid project: project.json missing');
  const manifestText = await manifestFile.async('string');
  const manifest = JSON.parse(manifestText) as ProjectManifest;
  if (!manifest || typeof manifest !== 'object' || !manifest.doc) {
    throw new Error('Invalid project: malformed manifest');
  }

  // Resolve every image src — when it points inside the archive, swap it for
  // a data URL inline; otherwise leave the original (data: or remote) URL.
  const missing: string[] = [];
  const layers: Layer[] = await Promise.all(
    (manifest.doc.layers ?? []).map(async (layer) => ({
      ...layer,
      objects: await Promise.all(
        (layer.objects ?? []).map(async (obj) => {
          if (obj.type !== 'image') return obj;
          const src = obj.src;
          if (typeof src !== 'string' || !isArchivePath(src)) return obj;
          const entry = zip.file(src);
          if (!entry) {
            missing.push(obj.name || src);
            return obj;
          }
          const base64 = await entry.async('base64');
          const mime = mimeFromPath(src);
          return { ...obj, src: `data:${mime};base64,${base64}` };
        }),
      ),
    })),
  );

  const doc = migrateDoc({ ...manifest.doc, layers });
  useEditor.getState().setDoc(doc, { record: true });
  if (missing.length > 0) {
    notify(
      'warning',
      `Project loaded, but ${missing.length} image${missing.length === 1 ? ' is' : 's are'} missing from the archive: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
    );
  }
}

function isArchivePath(s: string): boolean {
  return s.startsWith(`${ASSETS_DIR}/`);
}

function filenameFor(doc: CanvasDoc): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `design-${doc.widthPx}x${doc.heightPx}-${ts}.designproj.zip`;
}

/**
 * Decode an `obj.src` (data: URL, blob: URL, or http(s) URL) and write it as
 * a binary asset inside the zip. Returns the relative path inside the archive
 * that should replace the original `src` value in the manifest.
 */
function encodeAssetForZip(src: string, name: string, index: number, folder: JSZip): string {
  if (src.startsWith('data:')) {
    const match = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(src);
    if (!match) {
      // Non-data URL we can't decode — keep src as is by returning the original.
      return src;
    }
    const mime = match[1] || 'application/octet-stream';
    const isBase64 = src.includes(';base64,');
    const payload = match[2];
    const ext = extFromMime(mime);
    const safeName = sanitizeName(name) || `image-${index}`;
    const path = `${ASSETS_DIR}/${index.toString().padStart(3, '0')}-${safeName}.${ext}`;
    if (isBase64) {
      folder.file(path.slice(ASSETS_DIR.length + 1), payload, { base64: true });
    } else {
      folder.file(path.slice(ASSETS_DIR.length + 1), decodeURIComponent(payload));
    }
    return path;
  }
  // Blob/http URL — leave src untouched; the user will be told it's external.
  return src;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'image/avif') return 'avif';
  return 'bin';
}

function mimeFromPath(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'avif') return 'image/avif';
  return 'application/octet-stream';
}

function sanitizeName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .slice(0, 40);
}
