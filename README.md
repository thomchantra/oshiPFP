# oshiPFP

Turn a drawing or illustration into a profile picture that stays sharp and legible at small
thumbnail sizes — crop, thicken/stylize the linework, grade the color, export.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/about/darkscreen.webp">
  <img src="public/about/lightscreen.webp" alt="oshiPFP screenshot">
</picture>

**[Try it live](https://oshipfp.netlify.app/)** — nothing you upload leaves your browser (see
[How it works](#how-it-works)).

## Features

- **7 tunable line-art algorithms** — Botan, Chie, Daiya, Fumiko, Gumi, Hinata, Tsukiko — each
  grows, thickens, colorizes, or textures existing linework in a different way. Pick one, tune it
  live against your own image. See the [showcase](#seven-algorithms) below.
- **Crop** with pinch/scroll-wheel zoom and pan, square or free-form.
- **Color grading** — curves, HSL, light/temperature/tint, gradient-map remapping.
- **Export** at native or custom resolution, PNG or JPEG, with independent color-grade intensity.
- **Dual Pane** side-by-side comparison view on desktop.
- Built-in preset gallery with real before/after examples per algorithm — the same examples shown
  below, loadable straight into the app as a starting point.

## How it works

Everything runs client-side in a single shared WebGL2 canvas — image upload, cropping, line-art
processing, color grading, and export all happen in your browser via raw WebGL2 shader passes, no
server round-trip. Nothing you upload is ever sent anywhere.

The pipeline is a fixed stage chain: **Crop → Line Art → Grade → Export**. Each stage renders to
an offscreen texture that the next stage samples from; only the final composite gets blitted to
the on-screen canvas. Export reads the full-resolution offscreen texture directly, so output
quality isn't capped by whatever size the live preview happens to be rendered at.

## Seven algorithms

Every algorithm starts from the same source image and the same fixed pipeline — what differs is
how each one detects and regrows linework. Two presets per algorithm below; the full gallery (5
each, plus every tunable parameter) is in the app itself via "Load Demo".

<table>
<tr><th>Algorithm</th><th>Before</th><th>After</th></tr>

<tr><td rowspan="2"><strong>Botan</strong><br>
Grows line art evenly outward in every direction, inflating it — the further from a line, the less it's affected. Gives smooth, rounded, chunky outlines.
</td>
<td><img src="public/presets/pathB/01/before.webp" width="500"></td>
<td><img src="public/presets/pathB/01/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathB/03/before.webp" width="500"></td>
<td><img src="public/presets/pathB/03/after.webp" width="500"></td></tr>

<tr><td rowspan="2"><strong>Chie</strong><br>
Softly blends color inward from the edges of line art, reads more gently with a gradual transition instead of a crisp added border.
</td>
<td><img src="public/presets/pathC/01/before.webp" width="500"></td>
<td><img src="public/presets/pathC/01/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathC/02/before.webp" width="500"></td>
<td><img src="public/presets/pathC/02/after.webp" width="500"></td></tr>

<tr><td rowspan="2"><strong>Daiya</strong><br>
Grows lines using the same true distance-transform math as Botan, smooth and round by default. Switch to Octagon mode for a faceted, chisel marker look.
</td>
<td><img src="public/presets/pathD/01/before.webp" width="500"></td>
<td><img src="public/presets/pathD/01/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathD/05/before.webp" width="500"></td>
<td><img src="public/presets/pathD/05/after.webp" width="500"></td></tr>

<tr><td rowspan="2"><strong>Fumiko</strong><br>
Detects edges directly instead of thickening existing lines. Produces crisp, naturally colorful edge-lines with real graduated transparency along each line.
</td>
<td><img src="public/presets/pathF/01/before.webp" width="500"></td>
<td><img src="public/presets/pathF/01/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathF/05/before.webp" width="500"></td>
<td><img src="public/presets/pathF/05/after.webp" width="500"></td></tr>

<tr><td rowspan="2"><strong>Gumi</strong><br>
Isolates a single luminance band via gradient-map,
then regrows it — good at pulling line work out of painterly, non-flat source art.
</td>
<td><img src="public/presets/pathG/02/before.webp" width="500"></td>
<td><img src="public/presets/pathG/02/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathG/05/before.webp" width="500"></td>
<td><img src="public/presets/pathG/05/after.webp" width="500"></td></tr>

<tr><td rowspan="2"><strong>Hinata</strong><br>High-pass detection — box-blur subtracted from
source — for crisp linework pulled out of photographic detail.</td>
<td><img src="public/presets/pathH/01/before.webp" width="500"></td>
<td><img src="public/presets/pathH/01/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathH/02/before.webp" width="500"></td>
<td><img src="public/presets/pathH/02/after.webp" width="500"></td></tr>

<tr><td rowspan="2"><strong>Tsukiko</strong><br>Laplacian edge detection with optional pre-blur —
finer, more textured line work than the high-pass path.</td>
<td><img src="public/presets/pathI/01/before.webp" width="500"></td>
<td><img src="public/presets/pathI/01/after.webp" width="500"></td></tr>
<tr><td><img src="public/presets/pathI/04/before.webp" width="500"></td>
<td><img src="public/presets/pathI/04/after.webp" width="500"></td></tr>

</table>

## Stack

[Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript (strict) + raw WebGL2
(no rendering library — twgl/regl, etc.) + [pica](https://github.com/nodeca/pica) for the final
Lanczos3 export downscale.

## Getting started

```sh
npm install
npm run dev      # starts the dev server
npm run build    # type-checks and builds a production bundle to dist/
npm run preview  # serves the production build locally
npm run lint     # oxlint
```

Requires Node.js and npm. No environment variables or backend service needed — it's a static
client-side app.

## License

[GNU AGPLv3](LICENSE). If you host a modified version of this app, the AGPL requires you to make
your modified source available to your users.
