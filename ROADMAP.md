# Roadmap — stability & feature decisions

Status of an audit done on 2026-06-11 (code review of the editor core, persistence,
Pixi interaction layer, and UI shell, plus findings from hands-on browser testing).
Each item is a checkbox so this file doubles as a TODO tracker. File references
point at the evidence, severity reflects user impact today.

- P0 = can lose work or crash the app
- P1 = visibly broken/annoying in normal use
- P2 = correctness/perf debt, low blast radius today
- Feature priorities (F1–F3) are ordered by expected value for a Photoshop-lite editor

---

## 1. Stability

### P0 — data loss & crash protection

- [x] _(shipped 2026-06-12)_ **Add a React error boundary around the app (and one around `PixiStage`).**
      There is none today (`src/App.tsx`), so any render error white-screens the whole
      editor — this actually happened with the text-editor selector bug fixed on
      2026-06-11. The boundary should show a "reload / copy error" panel and keep the
      document in memory so autosave still flushes.
- [x] _(shipped 2026-06-12 — sticky banner + recovery toast)_ **Surface autosave failure in the UI.** The library autosaves to localStorage
      with a 400 ms debounce (`src/library/useLibrarySync.ts`), and quota errors are
      caught but only `console.warn`-ed (`src/library/libraryStore.ts:138`). Images are
      stored as base64 data URLs, so a handful of large photos can exceed the 5–10 MB
      quota — after that, every edit is silently unsaved and a reload loses work.
      Minimum fix: a persistent "changes not saved" banner when a save throws.
- [ ] **Move image assets out of localStorage into IndexedDB.** Decision: keep the
      doc JSON in localStorage (cheap, sync) but store image bytes in IndexedDB keyed
      by content hash, with docs referencing the key. Removes the quota cliff, removes
      the 33 % base64 overhead, and makes the library scale past a few designs.
- [x] _(Vitest shipped 2026-06-12 — 17 tests over history/coalescing/reorder/
      clamping/migration in `src/editor/__tests__`, `npm test`)_ **Set up a test
      harness.** Decision: Vitest for store-level unit tests plus a small Playwright
      smoke suite.
- [ ] **Formalize the Playwright smoke suite** (launch, add layers, drag-reorder,
      text edit, export PNG). The ad-hoc scripts used for verification are a ready
      template; they need a config + CI-friendly launcher in the repo.

### P1 — broken or annoying in normal use

- [x] _(shipped 2026-06-12 — store-level, also covers canvas drags and typing)_ **Coalesce history entries from sliders.** Every tick of the opacity slider
      (`src/ui/LayersPanel.tsx`) and every effect-parameter slider
      (`src/ui/EffectsPanel.tsx`) calls `recordAnd` (`src/editor/store.ts:157`), so one
      brightness drag creates dozens of undo steps and evicts useful history
      (HISTORY_MAX = 50). Decision: coalesce in the store — if the same field of the
      same object changes within ~300 ms, replace the previous history entry instead of
      pushing a new one. That fixes all sliders at once without touching each input.
- [x] _(shipped 2026-06-12 — clamped in store + dialog warning)_ **Validate canvas dimensions.** `NewCanvasDialog` clamps only to ≥ 1 px; a
      100 000 px canvas is accepted and will OOM/blank the WebGL context (GPU texture
      limits are typically 8–16 k). Clamp to 8192 with an explicit warning, and read
      the real limit from `app.renderer` where available.
- [x] _(shipped 2026-06-12 — per-file error toast, non-image warning)_ **Handle image-import failures.** `importImageFiles` is fire-and-forget from
      the toolbar and drop zone (`src/ui/TopBar.tsx:29`, `src/ui/useDropzone.ts`); a
      corrupt file rejects silently. Wrap with a toast ("Could not import foo.png").
- [x] _(shipped 2026-06-12 — summary toast with names)_ **Warn on missing assets when importing a project.** `importProjectZip`
      silently keeps the original (likely dead) `src` when a zip entry is missing
      (`src/editor/projectArchive.ts:87`). Show a summary ("2 images missing") instead
      of rendering blank sprites with no explanation.
- [x] _(shipped 2026-06-12 — debounced prune keeps doc + history srcs)_ **Evict the texture cache on document switch.** `PixiScene.textureCache`
      grows forever (`src/editor/pixi/PixiScene.ts:314`), and scene destroy passes
      `texture: false`. Decision: on `setDoc`/`newDoc`, drop cache entries whose `src`
      is not referenced by the new doc _or any history entry_, and destroy their GPU
      textures.
- [x] _(shipped 2026-06-12)_ **Pin the Layers-panel footer.** With ~5+ layers the "+ Layer" button scrolls
      out of the floating window's default height (found during panel testing). Make
      the list scrollable with header/footer pinned inside the window.

### P2 — debt, low blast radius

- [ ] **Centralize object-URL lifecycle.** `removeObject`/`removeLayer` revoke
      `blob:` URLs immediately (`src/editor/store.ts`), but the object may still be
      referenced by undo history or by a duplicate sharing the same `src` — undo then
      restores a broken image. Imports use data URLs today, so exposure is limited to
      legacy/edge paths. Decision: never revoke eagerly; sweep unreferenced blob URLs
      on `newDoc`/`setDoc` (same pass as texture-cache eviction). Also: `setDoc`
      currently revokes nothing at all.
- [x] _(shipped 2026-06-12)_ **Skip text re-measure on pure-transform updates.** `updateObject` runs
      `measureText` on _every_ patch to a text object, including each x/y tick during a
      drag (`src/editor/store.ts:441`). Only re-measure when text/font/size/weight/
      line-height/letter-spacing changed.
- [ ] **Clamp the snap threshold.** Threshold is `6 / zoom` doc-px
      (`src/editor/pixi/PixiStage.tsx:484`): at 0.1× zoom it's 60 px (everything
      snaps), at 8× it's sub-pixel (nothing snaps). Clamp to e.g. 2–24 doc-px.
- [ ] **Bound panning / add view-reset.** Pan is unclamped; users can strand the
      canvas off-screen. Either clamp pan so ≥ 10 % of the canvas stays visible, or
      ship `⌘0` fit / `⌘1` 100 % shortcuts (see Features) as the recovery path.
- [ ] **Tie export-blob revocation to the download.** Exports revoke the object URL
      on a fixed 1 s timer (`src/editor/export.ts:34`, `projectArchive.ts:58`); slow
      machines could lose the download. Revoke on the anchor's next macrotask after
      click, with a generous (30 s) fallback.
- [ ] **Guard against two-tab clobbering.** Two tabs share the localStorage
      library; last write wins silently. A `BroadcastChannel` "who is editing doc X"
      handshake with a read-only mode in the second tab is enough.
- [ ] **Establish the zustand selector convention.** The 2026-06-11 crash came from
      a selector returning a fresh object (`useEditor((s) => ({...}))`), which loops
      `useSyncExternalStore`. Convention (now followed everywhere): select primitives
      or stable references only; consider a lint rule or `useShallow` where a tuple is
      genuinely needed.
- [ ] **Note on workers:** a commit message mentions web-worker canvas filters, but
      no `Worker` is used anywhere in `src/` today — effects run as Pixi GPU filters,
      which is fine. Treat "offload heavy raster work (export at 3×, future crop) to a
      worker" as open work, not a regression.

---

## 2. Features

### F1 — highest value next

- [ ] **Clipboard: ⌘C/⌘X/⌘V.** Internal clipboard for objects (serialize the
      object JSON; paste with a small offset, into the active layer), plus `paste`
      event handling so an OS-clipboard image pastes as a new image object. Today only
      ⌘D duplicate exists (`src/ui/useKeyboard.ts`).
- [ ] **Trackpad-native navigation.** Adopt the Figma model in `onWheel`
      (`src/editor/pixi/PixiStage.tsx:651`): plain two-finger scroll pans,
      `ctrlKey`-wheel (macOS pinch) zooms at the cursor. Keep bare-wheel zoom for mice
      via a heuristic (`deltaMode`/integer deltas) or a preference toggle.
- [ ] **Zoom & selection shortcuts.** `⌘0` fit canvas, `⌘1` 100 %, `⌘+`/`⌘-` zoom,
      `Escape` deselect, `⌘A` select all in active layer, `⌘⇧]`/`⌘⇧[`
      bring-to-front/send-to-back (the relative `[`/`]` steps already exist).
- [ ] **Align & distribute.** Multi-select exists (`additionalSelectedObjectIds`)
      but there's no align UI. Add a Properties-panel strip when 2+ objects are
      selected: align left/center/right/top/middle/bottom, distribute horizontal/
      vertical spacing; "center on canvas" for single selection.
- [ ] **Text word-wrap.** Decision: add `autoWidth: boolean` to `TextObject`
      (default true = current behavior). When the user drags a horizontal resize
      handle, set `autoWidth: false`, fix the width, and enable `wordWrap` in the Pixi
      style + `measureText`; height stays derived. This matches Figma's auto-width vs
      fixed-width text and keeps migration trivial.

### F2 — strong additions

- [ ] **Alt-drag to duplicate.** Standard design-tool gesture; Alt currently only
      disables snapping during move.
- [ ] **Crop tool for images.** Decision: non-destructive crop rect stored on
      `ImageObject` (doc-space `cropX/Y/W/H`), rendered via Pixi texture frame — keeps
      undo simple and the original pixels available.
- [ ] **Gradient fills for shapes.** Two-stop linear gradient first (angle +
      two colors) via Pixi `FillGradient`; defer radial/multi-stop.
- [ ] **More export formats.** JPEG/WebP with a quality slider (canvas.toBlob
      already underneath), "copy PNG to clipboard" (Clipboard API), and "export
      selection only" (bounds of selected objects instead of canvas crop).
- [ ] **Font picker upgrade.** The Chromium `queryLocalFonts` integration (shipped
      2026-06-11) lists every installed family, but `<datalist>` can't render previews.
      Build a custom combobox that renders each family name in its own typeface, with
      search; keep the datalist as the non-Chromium fallback.
- [ ] **Rotation snap without modifier at common angles.** Light magnetic snap at
      0/45/90/… (±1°) even without Shift; Shift keeps the strict 15° steps.
- [ ] **Library thumbnails.** Render a small PNG per design on save (reuse
      `extractDocCanvas` at thumb scale) so `LibraryDialog` shows previews, not names.

### F3 — later / nice to have

- [ ] **Groups inside layers.** Deferred deliberately: layers already act as
      groups (shared opacity/blend/lock/visibility). Revisit only if users ask for
      nesting; a cheaper stopgap is "select all objects in layer" (double-click the
      layer row body).
- [ ] **Touch & mobile.** `touchAction: 'none'` is set but there are no gesture
      handlers — pinch zoom and one-finger drag would make tablets usable.
- [ ] **Per-character text styling (bold/italic ranges, underline).** Large lift
      with Pixi `Text`; would likely need `HTMLText` or text segmentation. Keep
      object-level weight/style for now; add an italic toggle (cheap) first.
- [ ] **History panel** (list of recent steps, click to jump) once history entries
      are coalesced and nameable.
- [ ] **Accessibility pass.** Icon buttons have `title` but no `aria-label`,
      panels aren't focus-trapped, and the canvas has no keyboard-only path.
- [ ] **Guide management.** Guides can be dragged from rulers and cleared
      (double-click corner), but there's no lock/hide-guides toggle or numeric entry.

---

## 3. Decision log

Decisions already made (and shipped) that future work should respect:

| Date       | Decision                                                                                                                                                                                                                            | Why                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-11 | **Lock blocks canvas transforms + keyboard nudge, not Properties-panel numeric edits.** Locked selection shows a dimmed, handle-less outline.                                                                                       | Explicit numeric entry is deliberate; accidental drags are what lock guards against. Revisit if users expect full freeze.           |
| 2026-06-11 | **Blend/opacity live in a selection-bound header strip in the Layers panel, not per row.**                                                                                                                                          | Per-row selects made rows two lines tall and unreadable; matches Photoshop's model.                                                 |
| 2026-06-11 | **Drag-and-drop: every dead zone in the Layers panel is a valid drop.** Below the list = move to bottom, above = top; dragging an object onto a layer row drops it into that layer (top of stack); no-op targets show no indicator. | HTML5 DnD cancels silently wherever `dragover` isn't prevented — dead zones were the root cause of "sometimes can't reorder".       |
| 2026-06-11 | **Installed fonts via Local Font Access API (Chromium), curated datalist as fallback.** Permission requested behind an explicit button; auto-loads silently once granted.                                                           | Only cross-browser way to do this without bundling fonts; free-text input still accepts any family name everywhere.                 |
| 2026-06-11 | **Text metrics: `lineHeight` stored as a multiplier of font size, `letterSpacing` in px.** Defaults 1.25 / 0 via `migrateDoc`.                                                                                                      | Multiplier survives font-size changes; px spacing matches Pixi's API directly.                                                      |
| 2026-06-11 | **Zustand selectors must return primitives or stable references.**                                                                                                                                                                  | A fresh-object selector put `useSyncExternalStore` into an infinite loop and crashed the editor (text double-click bug).            |
| earlier    | **Layers are containers; objects (image/text/shape) live inside them.** `migrateDoc` wraps legacy single-drawable layers.                                                                                                           | Keeps Photoshop-style layer semantics while allowing multiple drawables per layer.                                                  |
| earlier    | **Images are imported as data URLs, not blob URLs.**                                                                                                                                                                                | Survives page reload with the localStorage library. Cost: quota pressure — see the IndexedDB TODO, which supersedes this long-term. |

---

_How this was produced: static audit of `src/editor`, `src/library`, `src/ui`
(file:line references above) plus live browser testing with Playwright during the
2026-06-11 session (drag-reorder, lock, text editing, font enumeration, export
paths). Re-verify line numbers before relying on them; the code moves._
