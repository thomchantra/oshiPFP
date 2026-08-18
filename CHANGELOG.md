# Changelog

All notable changes to oshiPFP are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this file starts at v0.3.0, oshiPFP's first
public release — earlier (v0.1/v0.2) history predates the public repo.

## [0.4.1] - 2026-08-19

### Added
- Header shortcut icon to open the algorithm gallery directly, without needing to be on the Line
  Art tab first.
- Hover tooltips on the header's icon buttons (Reset, Help, Gallery, theme toggle).

### Fixed
- Grade tab's "Original" toggle (and its Dual Pane left pane) now shows the true, ungraded Line
  Art module output instead of the pre-Line-Art image — matching the app's actual pipeline order
  (Crop → Line Art → Grade → Export), where "before Grade" means "after Line Art."
- Restored Gumi's Fill mode Threshold slider, which had gone missing from the UI in the v0.4
  Line Art tab restructure despite the underlying detection mask still depending on it.

## [0.4.0] - 2026-08-17

### Added
- **Blend modes expanded from 6 to 12**, grouped into four categories (Composite, Lighten, Darken,
  Contrast): adds Add, Color Dodge, Darker Color, Linear Burn, Soft Light, and Hard Light alongside
  the existing Overwrite/Multiply/Screen/Overlay/Normal/Difference. Darker Color compares whole-pixel
  BT.709 luminance rather than a per-channel min, so it picks the entire winning pixel's hue/sat
  intact; Soft Light uses the W3C/Photoshop formula rather than an Overlay-with-roles-swapped
  approximation.
- **Pre-Blend Correction ("Color Correct")** — a new module applying Exposure, Contrast, Saturation,
  and Invert Matte directly to the resolved line-art layer right before it composites onto the base
  photo. Off by default; runs once per frame regardless of how many downstream views (composite,
  overlay passthrough, dual-pane peeks, export) consume the result.
- **Line Art tab restructured into 3 subtabs** — Tuning (Denoise/Tone Lift/Color Lift, always
  expanded), LineArt (algorithm picker + per-algorithm params), and Blending (the new Color Correct
  module plus Blend Mode/Opacity/Overlay Passthrough) — with a sticky header bar that stays pinned
  while scrolling. Grade tab's Light/Color/HSL subtabs got the same sticky treatment.

### Changed
- Tuning subtab reordered to Denoise → Tone Lift → Color Lift, with all three sections' sliders
  always visible instead of each needing to be expanded individually.
- Tuning and Grade sliders that represent a -1..1 or 0..1 fraction (Denoise, Tone Lift's clip/pinch
  controls, Color Lift, Color Correct, Grade's Light/Color/HSL adjustments) now display as a
  percentage instead of a raw decimal, matching the convention the Blending subtab introduced.
  Sliders in a non-normalized domain (Exposure in EV stops, Contrast's multiplier, Hue in degrees)
  are left as-is.
- Algorithm picker is now a single horizontally-scrolling row on mobile instead of wrapping onto a
  second line.
- The Tuning subtab is hidden entirely while Chie is the active algorithm (it erodes the crop
  directly, so pre-detection tuning has no effect) rather than being selectable into a dead
  "doesn't apply" message; switching to Chie while already on Tuning now bounces back to the
  LineArt subtab automatically instead of landing on that dead end.

### Fixed
- Fumiko's Find Edge mode ignored Overlay Passthrough's matte color and always showed a plain white
  background — root cause was `findEdges.frag.ts` (and, transitively, three shared downstream
  shaders) hardcoding alpha to 1.0 instead of deriving real per-pixel edge coverage.
- The Grade tab could get stuck showing a flattened Overlay preview after switching away from it in
  the Line Art tab or Dual Pane view — Grade and Export now always resolve against the true
  composited result, decoupled from whichever preview mode Line Art's own strip happens to show.
- Overlay Passthrough's matte-color picker could leak its last-set color into the plain Overlay
  preview peek even while the Overlay Passthrough toggle itself was off.

## [0.3.1] - 2026-08-15

### Fixed
- Crop tab's zoom pill — double-tapping it now actually resets zoom/pan back to the centered
  default, instead of doing nothing.
- Chie's Hardness slider got the same smoothstep-domain-clamp fix Daiya received the session
  before (strongly negative Hardness could incorrectly fade even fully solid fill areas);
  re-derived independently since Chie runs its own shader rather than sharing Daiya's.

## [0.3.0] - 2026-08-14

First public release — source made public on GitHub, deployed to
[oshipfp.netlify.app](https://oshipfp.netlify.app/), AGPL-3.0 licensed.

### Added
- **3 new line-art algorithms**: Gumi, Hinata, and Tsukiko, bringing the total to 7 (alongside
  Botan, Chie, Daiya, Fumiko). Gumi introduced "Dual Line" mode — two independent luminance-band
  detectors merged into one result, rather than a single always-on ramp.
- **Gradient Map** — a 3-stop (or 2-stop duotone) color-remap shading module, shared between every
  line-art algorithm's own fill options and a new general post-grade processor in the Color tab.
- **Dual Pane view** for the Line Art and Color tabs on desktop/wide viewports — side-by-side
  Original/Composite/Overlay comparison.
- Line Expansion info modal gained a real gallery of example presets with live before/after demos
  per algorithm.
- JSON preset system: presets are self-contained JSON files loadable from a real gallery UI, plus
  dev-mode Dump/Load State tooling for round-trip validation.
- App-wide Reset (clears the loaded image and every tuned parameter back to defaults).

### Changed
- Every algorithm mode now offers 3 shading options — sample color from the source image, solid
  color, or gradient-map fill.
- Daiya was ported from an integer-texel min-filter dilate onto the same Jump-Flooding-Algorithm
  distance-field primitive Botan uses, fixing a usability gap where its growth radius was
  effectively a no-op below 1.0 texel; Octagon growth (a faceted, chisel-marker look) survives as a
  second, independently-tunable operation mode alongside the smooth JFA default.
- Tuned several algorithms' line-thickness sliders for more precision, addressing visible
  stair-stepping at small radii.

### Fixed
- Line art could occasionally render with inverted shapes right after switching algorithms.
- Several detection/color settings could silently leak from one algorithm's tuning into another's
  (a shared-GL-uniform-state class of bug — see `CLAUDE.md`'s Known Recurring Gotchas for the full
  writeup).
- The Line Art preview didn't update live while resizing or repositioning a crop.
- Gradient Map ignored color adjustments made afterward in the Grade tab (it was running before
  Curve/HSL/Temperature/Tint in the pipeline instead of after; reordered to run first).
