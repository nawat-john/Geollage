# Tecto Studio

An interactive 3D tectonic-plates studio, built as a static Next.js app — no backend,
no database. Everything runs in the browser; work is saved by exporting a project file.

Two headline features:

- **Time Machine** — scientifically-sourced plate reconstruction playback from deep time
  (up to 1.8 billion years ago) to present, with a guided tour and named epoch markers.
- **Sandbox** — grab a plate and drag it around the globe, or slice it into pieces with a
  great-circle or freehand cut, with full undo/redo.

Also:

- **Your place through time** — pin a spot (or use your location) and see where it sat,
  and the path it travelled, at any point in the timeline.
- **Motion arrows** — each plate's heading and speed (cm/yr) at the current time.
- **Pangaea puzzle** — drag the continents back around Africa into their ~250 Ma
  positions; pieces snap in when close, with a hint overlay.
- **Share link** — copies a URL whose `#hash` reopens the same time, camera and pinned
  place (no server involved).

Plus **Export/Import**: save the current state (mode, camera, timeline, plates, any cuts
or drags) to a `.tecto.json` file and reopen it later — the only persistence layer, since
there is deliberately no server.

See [`plan.md`](./plan.md) for the full design doc, milestone history, and notes on
tradeoffs made along the way.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The globe loads plate geometry and
rotation data from `public/data/*.json`, generated ahead of time by the preprocessing
script (see below) — you don't need to run it just to develop the app.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (Turbopack). |
| `npm run build` | Static production build (`output: 'export'`) into `out/`. |
| `npm start` | Serve the last `npm run build` output (Next's own server; for a fully static host, serve `out/` directly). |
| `npm run lint` | ESLint. |
| `npm test` | Vitest unit tests (geometry math, cut algorithm, project file round-trip). |
| `npm run test:e2e` | Playwright end-to-end tests (reconstruction, sandbox, export/import) — starts its own dev server. |
| `npm run preprocess` | Re-fetches plate polygons, rotations and coastlines from the GPlates Web Service; overwrites `public/data/*.json`. |

## Refreshing the plate data

`scripts/preprocess/fetch-data.mjs` is a one-off script (not part of the app bundle), run
through `tsx` so it can reuse the app's spherical geometry code. It hits the
[GPlates Web Service](https://gws.gplates.org) for:

- `topology/plate_polygons` — present-day topological plate boundaries (46 plates for the
  default model), simplified to a reasonable vertex budget.
- `rotation/get_quaternions` — finite rotation keyframes for each plate, every 10 Ma across
  the model's full time range.
- `reconstruct/coastlines` — present-day coastlines. GWS returns thousands of terrane
  polygons with no plate id, so the script assigns each to the plate it sits on, unions
  them per plate (never across plates), then simplifies — simplifying neighbouring
  terranes separately leaves hairline gaps across every continent. The app re-assigns
  land polygons to plates at load time, which also keeps land on the right piece after
  a Sandbox cut.

Run it with:

```bash
npm run preprocess
```

This overwrites `public/data/plates.geo.json`, `public/data/rotations.json`,
`public/data/coastlines.json`, and `public/data/attribution.json`. Commit the regenerated files — they're static assets, not
generated at build time.

To switch reconstruction models, change `MODEL` at the top of the script (see
[gwsdoc.gplates.org/models](https://gwsdoc.gplates.org/models) for the full list and their
time ranges) and re-run it.

**If you ever see plates snap or jump during playback:** re-run the preprocess script.
There was a real bug here once — see the note in `plan.md` §Phase 2 about
`group_by_pid` not preserving keyframe order — so this is the first thing to suspect if
reconstruction motion looks wrong after touching the data pipeline.

## Testing

- **Unit tests** (`npm test`, Vitest): spherical math, the earcut+subdivision
  triangulation pipeline, the turf-based cut algorithm (box/concave/multi-ring cases), and
  the project-file export/import round-trip.
- **E2E tests** (`npm run test:e2e`, Playwright): drives the real app in a browser —
  reconstruction playback + tour + plate selection, sandbox drag/cut/undo, and a full
  export → reload → import round trip. Runs serially (`workers: 1`) by design: each test
  spins up a real WebGL context, and running several in parallel against one dev server is
  enough contention to cause flaky timeouts on modest hardware.

## Deploying

`npm run build` produces a fully static site in `out/` — no server-side rendering, no API
routes, no environment variables. Deploy `out/` to any static host (GitHub Pages, Netlify,
Vercel's static hosting, Cloudflare Pages, S3 + CloudFront, etc.); there's nothing
Next.js-specific required at runtime beyond serving static files.

## Data licensing & attribution

Reconstruction data comes from EarthByte/GPlates models via the GPlates Web Service and
carries citation requirements — see the in-app "Data & credits" panel (bottom-right) or
`public/data/attribution.json` for the current model's citation and license. Confirm the
specific terms for whichever model you configure before redistributing.

## Known limitations

See `plan.md` for the full list per phase; the notable ones:

- Cut operations run on the main thread. `new Worker(new URL(...))` doesn't compile to an
  actual worker bundle under Next 16.2.9's Turbopack with `output: 'export'` (it copies the
  target file as a raw static asset even with zero dependencies) — fine at current plate
  sizes (low single-digit ms per cut), but revisit if that changes.
- No boundary-type (subduction/ridge/transform) coloring — the data pipeline only fetches
  plate polygons, not classified boundary segments.
- Independent rigid-plate rotation means plates can visibly overlap mid-reconstruction;
  there's no collision handling (by design — this isn't a geodynamics simulator).
