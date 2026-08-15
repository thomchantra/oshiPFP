# src/lab

This is an internal algorithm-tuning harness, not part of the shipped app — it's where new line-art
detection algorithms get prototyped and A/B'd against real artwork before being ported into the
production pipeline (`src/gl/pipeline.ts`). Every algorithm that made it into the real app (Botan,
Chie, Daiya, Fumiko, Gumi, Hinata, Tsukiko) started here.

Entry point is `lab.html` (root of the repo), not `index.html`. It's excluded from production
builds by default — see `vite.config.ts`'s `includeLab` check — but still reachable via
`npm run dev` (the dev server serves any file in the project root regardless of the build config)
or `npm run build:with-lab` when a real production-parity build with the lab included is needed.

`pathE.ts` is an experimental algorithm (contour-tracing via `clipper2-ts`/`imagetracerjs`) that
was tried and abandoned during v0.2 development — it never shipped to production and has no
`pathE` equivalent in `src/types.ts`'s `LineArtMode`. Kept here for reference rather than deleted;
the two npm dependencies it pulls in exist solely to serve this one file.
