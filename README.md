# oshiPFP

Turn a drawing or illustration into a profile picture that stays sharp and legible at small
thumbnail sizes — crop, thicken/stylize the linework, grade the color, export.

![oshiPFP screenshot](public/about/lightscreen.webp)

**[Try it live](https://oshipfp.netlify.app/)** — nothing you upload leaves your browser (see
[How it works](#how-it-works)).

## Features

- **7 tunable line-art algorithms** — Botan, Chie, Daiya, Fumiko, Gumi, Hinata, Tsukiko — each
  grows, thickens, colorizes, or textures existing linework in a different way. Pick one, tune it
  live against your own image.
- **Crop** with pinch/scroll-wheel zoom and pan, square or free-form.
- **Color grading** — curves, HSL, light/temperature/tint, gradient-map remapping.
- **Export** at native or custom resolution, PNG or JPEG, with independent color-grade intensity.
- **Dual Pane** side-by-side comparison view on desktop.
- Built-in preset gallery with real before/after examples per algorithm.

## How it works

Everything runs client-side in a single shared WebGL2 canvas — image upload, cropping, line-art
processing, color grading, and export all happen in your browser via raw WebGL2 shader passes, no
server round-trip. Nothing you upload is ever sent anywhere.

The pipeline is a fixed stage chain: **Crop → Line Art → Grade → Export**. Each stage renders to
an offscreen texture that the next stage samples from; only the final composite gets blitted to
the on-screen canvas. Export reads the full-resolution offscreen texture directly, so output
quality isn't capped by whatever size the live preview happens to be rendered at.

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
