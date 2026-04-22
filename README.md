# Design — WebGL Image Editor

A full-page WebGL (PixiJS v8) image editor in the browser. Vite + React + TypeScript. Deploys to GitHub Pages from the `docs/` folder.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build         # type-check + build into docs/
npm run build:pages   # CNAME-preserving build (used by pre-commit)
npm run typecheck
npm run lint
```

## Deploy (GitHub Pages)

1. Push to `main`.
2. In repo settings → Pages, set **Source** to **Deploy from branch → `main` / `/docs`**.
3. (Optional) put your domain in `docs/CNAME`. The build hook will preserve it across rebuilds.

The pre-commit hook automatically rebuilds `docs/` on every commit and stages it.

To skip the hook in an emergency: `git commit --no-verify`.

## Features

- Define canvas size in pixels, transparent or solid background
- Drag-and-drop / import local images as layers
- Move, resize (Shift = aspect, Alt = from center), rotate
- Text layers with font / size / weight / color / align
- Layers panel: reorder, visibility, lock, opacity, blend mode
- Per-layer effects: brightness/contrast, HSL, blur, drop shadow, invert/grayscale/sepia, sharpen/noise/pixelate, color tint
- Undo / redo
- PNG export with scale (1×/2×/3×), transparency toggle, background color, crop-to-canvas

## Keyboard

| Action          | Shortcut                 |
| --------------- | ------------------------ |
| Undo / Redo     | ⌘Z / ⌘⇧Z                 |
| Duplicate layer | ⌘D                       |
| Delete layer    | Delete / Backspace       |
| Nudge           | Arrow keys (Shift = ×10) |
| Reorder         | `[` `]`                  |
| Pan             | Hold Space + drag        |
| Zoom            | Mouse wheel              |
