import type { PixiScene } from './PixiScene';

/** Module-level accessor used by the export module. */
export function getActiveScene(): PixiScene | null {
  const fn = (window as any).__pixiScene as undefined | (() => PixiScene | null);
  return fn ? fn() : null;
}

export function setActiveScene(get: () => PixiScene | null) {
  (window as any).__pixiScene = get;
}

export function clearActiveScene() {
  delete (window as any).__pixiScene;
}
