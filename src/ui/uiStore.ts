import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PanelKey = 'leftToolbar' | 'canvas' | 'layers' | 'properties' | 'effects';

export const PANEL_LABELS: Record<PanelKey, string> = {
  leftToolbar: 'Left toolbar',
  canvas: 'Canvas panel',
  layers: 'Layers panel',
  properties: 'Properties panel',
  effects: 'Effects panel',
};

export type WindowKey = Exclude<PanelKey, 'leftToolbar'>;

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const initialWindowDefaults = (): Record<WindowKey, WindowRect> => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return {
    canvas: { x: Math.max(8, vw - 304), y: 56, w: 288, h: 240 },
    layers: { x: Math.max(8, vw - 304), y: 312, w: 288, h: 280 },
    properties: { x: Math.max(8, vw - 608), y: 56, w: 288, h: 360 },
    effects: { x: Math.max(8, vw - 608), y: 432, w: 288, h: 280 },
  };
};

interface UIState {
  panels: Record<PanelKey, boolean>;
  windows: Record<WindowKey, WindowRect>;
  togglePanel: (key: PanelKey) => void;
  setPanel: (key: PanelKey, visible: boolean) => void;
  setWindow: (key: WindowKey, rect: Partial<WindowRect>) => void;
  resetWindows: () => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      panels: {
        leftToolbar: true,
        canvas: false,
        layers: true,
        properties: true,
        effects: true,
      },
      windows: initialWindowDefaults(),
      togglePanel: (key) => set((s) => ({ panels: { ...s.panels, [key]: !s.panels[key] } })),
      setPanel: (key, visible) => set((s) => ({ panels: { ...s.panels, [key]: visible } })),
      setWindow: (key, rect) =>
        set((s) => ({
          windows: { ...s.windows, [key]: { ...s.windows[key], ...rect } },
        })),
      resetWindows: () => set({ windows: initialWindowDefaults() }),
    }),
    {
      name: 'design-ui-v3',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>;
        return {
          ...current,
          ...p,
          panels: { ...current.panels, ...(p.panels ?? {}) },
          windows: { ...current.windows, ...(p.windows ?? {}) },
        } as UIState;
      },
    },
  ),
);
