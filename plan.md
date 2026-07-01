# Plan — Interactive 3D Tectonic Plates Studio

A **client-only Next.js** web app for learning how tectonic plates have moved from
deep geological time to the present. No backend, no database — all state lives in the
browser and is saved via **file export / import**.

---

## 1. Product Goals

Two headline features:

1. **Time Machine (Reconstruction mode)** — a scientifically grounded playback of plate
   motion across geological time (present ⇄ ancient), driven by a real rotation model.
   Purpose: *learning* the drift of plates from ancient supercontinents to today.
2. **Sandbox (Cut & Drag mode)** — a globe *canvas* where the user can **split a plate**
   along a line and **drag pieces around the sphere** freely. Purpose: hands-on,
   "what if I move this piece here?" exploration.

Plus the enabling capability:

3. **Export / Import** — save the current work (edited plates, camera, timeline position)
   to a downloadable file and reopen it later. This is the *only* persistence layer,
   because there is deliberately **no server or DB**.

### Non-goals (v1)
- No user accounts, sharing links, or cloud sync.
- No numerical geodynamics simulation (mantle convection, force modelling). We *replay*
  and *manually edit* geometry; we do not physically simulate it.
- No mobile-native app (responsive web only).

---

## 2. Domain Primer (read before coding)

The app is easier to build correctly if the team shares this mental model:

- **Plate** — a rigid spherical polygon (a "puzzle piece") on the surface of a unit sphere.
  It has one or more closed rings of `(lon, lat)` vertices and a stable `plateId`.
- **Plate motion is rotation, not translation.** On a sphere, a plate moves by rotating
  about an **Euler pole** (an axis through the sphere's center) by some angle. This is why
  we store orientations as **quaternions**, not x/y offsets.
- **Rotation model** — for reconstruction, each plate has a series of **finite rotations**
  keyed by time (e.g. at 0, 10, 20 … Ma). To draw the world at time *T*, interpolate
  (SLERP) between the two nearest keyed rotations and apply the result to the plate's
  present-day geometry.
- **Rotation hierarchy** — in the real data, rotations are *relative* to a parent plate and
  composed up a tree to an absolute ("mantle") frame. We **flatten this to absolute
  rotations per plate during offline preprocessing** so the runtime only does SLERP + apply.
- **Boundary types** — divergent (spreading), convergent (subduction/collision), transform.
  Used only for coloring/teaching, not physics.

Implication for design: **one shared `Plate` primitive powers both features.**
Reconstruction feeds it keyed rotations; Sandbox lets the user author rotations (drag) and
edit geometry (cut).

---

## 3. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript**, `output: 'export'` | Fully static build → deploy to GitHub Pages / Netlify / Vercel static. Matches "no backend." |
| 3D | **three.js + @react-three/fiber + @react-three/drei** | Declarative Three.js in React; drei gives OrbitControls, Html labels, gizmos. |
| R3F in Next | Client component, `dynamic(() => import(...), { ssr: false })`, add `transpilePackages: ['three']` in `next.config` | R3F cannot render on the server; must be client-only to avoid hydration errors. |
| State | **Zustand** | Works cleanly with the R3F render loop; avoids React re-render storms on drag. |
| Geo / geometry | **turf.js** + **d3-geo** + custom spherical math | Polygon ops, projections; custom code for great-circle cutting on the sphere. |
| Heavy ops | **Web Workers** (Comlink) | Run cut/boolean/simplify off the main thread so the globe never freezes. |
| UI | **Tailwind CSS** + Radix/shadcn primitives | Timeline slider, panels, dialogs. |
| File I/O | Browser **File API** + `Blob` download; optional **file-saver** | Export/import project files; no server needed. |
| Autosave | **IndexedDB** (via `idb`) | Local "recent projects" + crash recovery — still zero backend. |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Especially for geometry math and export/import round-trips. |

---

## 4. Data Model

### 4.1 Runtime types (conceptual)

```ts
type Vec2 = [lon: number, lat: number];         // degrees
type Ring = Vec2[];                              // closed ring
type Quat = [x: number, y: number, z: number, w: number];

interface FiniteRotation {
  timeMa: number;      // age in millions of years
  quat: Quat;          // ABSOLUTE rotation (already flattened from hierarchy)
}

interface Plate {
  id: string;          // internal id (stable across cuts)
  plateId?: number;    // original GPlates plate id (may be shared after a cut)
  name: string;
  rings: Ring[];       // present-day geometry (reference frame)
  color: string;
  rotations: FiniteRotation[];  // reconstruction keyframes (empty in pure sandbox)
  userTransform?: Quat;         // sandbox: extra rotation the user applied by dragging
  derivedFrom?: string;         // if created by a cut, the parent plate id
}
```

### 4.2 Project file format (the export)

A single JSON document. Give it a friendly extension (e.g. `.tecto.json`) so it double-clicks
into a browser but is obviously ours.

```jsonc
{
  "format": "tecto-studio",
  "schemaVersion": 1,
  "createdAt": "ISO-8601",
  "app": { "version": "1.0.0" },
  "mode": "reconstruction" | "sandbox",
  "camera": { "position": [x,y,z], "target": [x,y,z], "zoom": 1 },
  "timeline": { "timeMa": 0, "min": 0, "max": 1000 },
  "model": { "name": "MERDITH2021", "attribution": "…" },
  "plates": [ /* Plate[], including any user cuts + drags */ ],
  "annotations": [ /* optional teaching notes placed by the user */ ]
}
```

Rules:
- Always write `schemaVersion`. Import **must** check it and run migrations for older files.
- Round-trip test is a first-class requirement: export → import → deep-equal.
- Keep numbers reasonably rounded to keep files small.

---

## 5. Data Pipeline (offline, build-time)

The runtime must be static, so all science data is prepared **ahead of time** and bundled
as JSON assets under `/public/data`.

**Source:** GPlates Web Service (`gws.gplates.org`) / EarthByte reconstruction models.
Candidate models (pick by time range + license):
- `MERDITH2021` / Cao et al. 2024 — deep time (up to ~1.8 Ga) → best for "ancient → now."
- `PALEOMAP` (Scotese) — 0–~750 Ma, visually clean.
- `MULLER2019`, `ZAHIROVIC2022` — detailed but shorter ranges.

**Preprocessing script (Node or Python/pyGPlates, run once, committed output):**
1. Fetch present-day plate polygons (static polygons) with `plateId`s.
2. Fetch or compute finite rotations per `plateId` at a fixed cadence (e.g. every 5–10 Myr).
3. **Flatten** relative rotations → absolute rotations (so runtime does no hierarchy math).
4. **Simplify** polygons (mapshaper / turf.simplify) to a web-friendly vertex budget.
5. Emit two artifacts:
   - `plates.geo.json` — present-day geometry + metadata.
   - `rotations.json` — `{ plateId: FiniteRotation[] }`.
6. Record **model name + citation + license** into `attribution.json` (see §11).

> Design note: bundle **rotations**, not per-time geometry. Interpolating quaternions is
> smoother and smaller than swapping whole geometries per frame, and it is the geologically
> correct way to move a rigid plate.

---

## 6. Rendering & Interaction Design

### 6.1 The globe
- A base sphere (subtle Earth texture or plain shaded sphere) as spatial reference.
- Each plate rendered as a **filled spherical polygon mesh**, slightly offset above the base
  radius so pieces read as separate, grabbable tiles. Triangulate via local projection +
  earcut, then project vertices back onto the sphere radius.
- Plate boundaries drawn as great-circle arc lines; optional color-by-boundary-type.

### 6.2 Applying a plate's orientation
- Reconstruction: `q = slerp(rot[i], rot[i+1], f)` for current `timeMa`; set mesh quaternion.
- Sandbox: `finalQuat = userTransform ∘ baseQuat`.

### 6.3 Picking & hover
- Three.js **Raycaster**; each plate mesh is pickable. Hover → highlight + name label
  (drei `<Html>`). Selection drives the side panel.

### 6.4 Drag (Sandbox core #1)
- Ray-sphere intersection gives the `(lon,lat)` point under the cursor.
- Frame-to-frame, dragging point **A→B** on the sphere = rotation about axis `A × B` by the
  angle between them → build incremental quaternion, compose into `userTransform`.
- This yields the natural "grab the globe and slide the piece" feel and stays on-sphere.
- Provide a mode toggle: **free rotate** vs **rotate about a fixed Euler pole** (teaching).

### 6.5 Cut (Sandbox core #2)
Two cut tools:
- **Great-circle cut (primary, robust):** user clicks two points → defines a plane through
  the sphere center. Classify each polygon vertex by side of the plane; split edges that
  cross it; stitch the intersection into two new closed rings → two new `Plate`s that inherit
  color/rotations from the parent. Pure 3D, no projection artifacts.
- **Freehand cut (secondary):** user draws a stroke; project the affected plate to a local
  tangent plane, run a planar polygon split (turf), project back. Warn near poles/antimeridian.
- Run splits in a **Web Worker**; show a busy indicator; make every cut **undoable**.

### 6.6 Timeline (Reconstruction core)
- Scrubber from `max` (ancient) → `0` (present), with play/pause, speed, and **named epoch
  markers** (e.g. Rodinia, Pannotia, Pangaea assembly/breakup, present).
- Scrubbing updates all plate quaternions live via SLERP.

---

## 7. Educational Layer

- **Guided tour**: scripted stops on the timeline with a caption card per major event
  (supercontinent assembly/breakup, ocean opening) — this is where the "learning" goal lands.
- **Free explore**: same timeline, no rails.
- Legend for boundary types; toggle plate names / IDs / velocities.
- Optional: show the active plate's **Euler pole** and instantaneous velocity as a teaching
  overlay.
- Inline "what am I looking at?" tooltips.

---

## 8. Suggested Project Structure

```
/app
  /(studio)/page.tsx          # loads the client-only Scene via dynamic import
/components
  /scene/Globe.tsx            # base sphere
  /scene/PlateMesh.tsx        # one plate (geometry + orientation)
  /scene/Scene.tsx            # <Canvas>, lights, controls, raycasting
  /tools/DragTool.ts          # sandbox drag gesture → quaternion
  /tools/CutTool.ts           # great-circle + freehand splitting
  /ui/Timeline.tsx
  /ui/InspectorPanel.tsx
  /ui/Toolbar.tsx
  /ui/TourOverlay.tsx
/lib
  /geo/spherical.ts           # lon/lat ↔ vec3, great-circle, slerp helpers
  /geo/triangulate.ts         # spherical polygon → mesh
  /geo/cut.ts                 # plane-vs-polygon split (worker-friendly)
  /model/plate.ts             # Plate type + operations
  /io/projectFile.ts          # export/import + schema migrations
  /io/idb.ts                  # autosave / recent projects
/workers
  geometry.worker.ts
/public/data                  # plates.geo.json, rotations.json, attribution.json
/scripts/preprocess/          # one-off GPlates fetch + flatten + simplify
```

---

## 9. Milestones (vertical slices — something visible each phase)

- **Phase 0 — Scaffold:** Next.js static export builds; globe renders; OrbitControls work.
- **Phase 1 — Plates on screen:** load bundled present-day plates as colored, pickable tiles.
- **Phase 2 — Time Machine:** rotation model + timeline + SLERP playback (ancient → now).
- **Phase 3 — Drag:** sandbox drag-to-rotate a selected plate on the sphere.
- **Phase 4 — Cut:** great-circle split (then freehand); undo/redo.
- **Phase 5 — Export/Import:** save/reopen a project file; autosave to IndexedDB.
- **Phase 6 — Learn:** guided tour, epoch markers, boundary-type legend, labels.
- **Phase 7 — Polish & Ship:** performance, a11y, empty/error states, deploy.

---

## 10. Progress Checklist

### Phase 0 — Scaffold
- [x] Create Next.js + TypeScript app (App Router).
- [x] Configure `next.config` for `output: 'export'` and `transpilePackages: ['three']`.
- [x] Install three, @react-three/fiber, @react-three/drei, zustand, tailwind.
- [x] Render a `<Scene>` client component via `dynamic(..., { ssr: false })`.
- [x] Base sphere + lights + OrbitControls; resizes correctly; no hydration warnings.
- [x] CI: typecheck + lint + `next build` (static export) green.
- **Done when:** a globe you can orbit ships as a static site. ✅

### Phase 1 — Plates on screen
- [x] Write `/scripts/preprocess` to fetch present-day plate polygons from GPlates.
- [x] Simplify polygons to a vertex budget; emit `plates.geo.json`.
- [x] `spherical.ts`: lon/lat ↔ unit vec3, great-circle interpolation, helpers (unit-tested).
- [x] `triangulate.ts`: spherical polygon → mesh; render each plate as a colored tile.
- [x] Raycast picking: hover highlight + name label; click selects; inspector panel shows info.
- **Done when:** the present-day plate mosaic renders and is selectable. ✅
  - Data source: GPlates Web Service, `topology/plate_polygons` + `rotation/get_quaternions`,
    model `MERDITH2021` (0–1800 Ma), 46 topological plates.
  - Notable fix: earcut triangulates in a flat local projection, so concave coastlines
    sometimes need long diagonals; rendered as flat chords those sagged below the base
    globe and read as holes. Fixed by recursively subdividing any triangle spanning more
    than ~6° so every triangle hugs the sphere (see `lib/geo/triangulate.ts`).

### Phase 2 — Time Machine (Reconstruction)
- [x] Extend preprocess to emit flattened absolute `rotations.json` at fixed cadence.
- [x] `plate.ts`: given `timeMa`, SLERP nearest rotations → orientation quaternion.
- [x] `Timeline.tsx`: scrubber + play/pause + speed; wired to global time state.
- [x] Named epoch markers on the timeline.
- [x] Smooth playback at 60fps for the full time range.
- **Done when:** scrubbing/playing shows plates drifting from ancient config to present. ✅
  - Known limitation: since each plate rotates independently with no collision handling
    (by design, per §1 non-goals), plates can visibly overlap mid-reconstruction at times
    away from present-day; this is an inherent property of independent rigid-plate SLERP,
    not a rendering bug. A handful of plate pairs (e.g. Nazca/South America) also show a
    small present-day topology overlap in the source MERDITH2021 data itself.
  - **Bug fixed during Phase 6 work:** `scripts/preprocess/fetch-data.mjs` originally used
    `get_quaternions?...&group_by_pid=1`, whose per-plate array order does **not** reliably
    match the requested `times=` list (verified against single-time requests to the same
    endpoint) — this silently mislabeled rotation keyframes with the wrong age for most
    plates, causing periodic snap-back-to-identity artifacts during playback. Fixed by
    using the ungrouped response, which keys each quaternion by its actual time string.
    Re-run `npm run preprocess` if you ever see plates snapping during playback.
  - Separately (not a bug): many plates hold at identity before some cutoff age — e.g.
    Nazca before ~260 Ma, several microplates for their entire history. This is the model
    correctly reporting "this plate doesn't exist yet," not a data error.

### Phase 3 — Drag (Sandbox #1)
- [x] Ray-sphere intersection → `(lon,lat)` under cursor.
- [x] `DragTool`: A→B on sphere → incremental quaternion; compose into `userTransform`.
- [x] Mode toggle: free-rotate vs fixed Euler-pole rotate.
- [x] Visual feedback while dragging; snap-to-original ("reset plate") action.
- [x] Undo/redo for drags.
- **Done when:** a plate can be grabbed and slid smoothly across the globe. ✅

### Phase 4 — Cut (Sandbox #2)
- [x] `cut.ts`: great-circle split (classify verts, split crossings, stitch new rings).
  Implemented as a thin planar buffer + `turf.difference` + `turf.flatten` in each plate's
  own local azimuthal-equidistant projection, rather than manual plane-vs-edge clipping —
  more robust against concave/multi-ring polygons, verified with unit tests (box, concave
  "horseshoe", multi-ring, and a miss case).
- [x] New plates inherit color/rotations; keep `derivedFrom` lineage.
- [ ] ~~Run splits in a Web Worker~~ — attempted via `new Worker(new URL(...))`, but
  Next.js 16.2.9's Turbopack (with `output: 'export'`) doesn't compile that pattern into a
  worker bundle; it copies the target file as a raw, unprocessed static asset even with zero
  dependencies. Runs on the main thread instead (`lib/workers/geometryClient.ts` still
  exposes an async API so this is a drop-in fix later); fine at current plate sizes
  (low single-digit ms per cut).
- [x] Freehand cut via local projection; requires the stroke to fully exit the plate on
  both ends to separate it (shows a "didn't separate" message otherwise) — the
  pole/antimeridian guard from the original plan is subsumed by the shared local-projection
  approach, which isn't lon/lat-based.
- [x] Undo/redo for cuts; unit tests on tricky polygons (concave, multi-ring).
- **Done when:** a user can slice a plate into pieces and drag each piece independently. ✅

### Phase 5 — Export / Import
- [x] `projectFile.ts`: serialize full state to the `.tecto.json` schema (v1).
- [x] Download via Blob; import via file picker + drag-drop onto the canvas.
- [x] Schema-version check + migration scaffold; reject/repair malformed files gracefully.
- [x] **Round-trip test:** export → import → deep-equal (Vitest).
- [x] IndexedDB autosave + crash-recovery prompt on reload.
  ("Recent projects list" beyond the single autosave slot was skipped as unnecessary for v1.)
- [ ] Optional bonus (`.glb`/PNG export) — skipped, not required for the "done when" bar.
- **Done when:** work survives a full reload via a downloaded file — no backend involved. ✅
  Verified end-to-end with Playwright: cut a plate in Sandbox, exported, reloaded the page
  fresh, imported the file, and the cut + mode were both restored.

### Phase 6 — Learn
- [x] Guided-tour data (ordered stops with time + caption) + `TourOverlay`.
- [ ] Boundary-type coloring + legend — skipped: the data pipeline only fetches topological
  plate polygons, not boundary-type-classified segments (subduction/ridge/transform), so
  there's nothing to color by yet. Would need a new fetch from GWS's `topology` boundary
  endpoints. Name/ID labels toggle is implemented (`showLabels` in the store, top-left
  toolbar in reconstruction mode).
- [x] Euler-pole + angular-speed teaching overlay for the selected plate, shown in the
  inspector panel during reconstruction (derived by differencing orientation 1 Myr apart —
  an approximation for teaching, not the model's literal instantaneous pole).
- [x] First-run onboarding modal (localStorage-gated, one-time).
- **Done when:** a newcomer can take the tour and understand the ancient→present story. ✅

### Phase 7 — Polish & Ship
- [x] Performance: verified 60fps (idle, reconstruction playback, sandbox drag) on real GPU
  hardware — headless Chromium defaults to SwiftShader software rendering, which reported
  ~8fps and would have been a false alarm; re-tested with `--use-gl=angle --use-angle=d3d11`
  to force real GPU use. At 46 plates / a few thousand triangles total, geometry LOD and
  mesh merging aren't warranted yet — plain `useMemo`'d per-plate geometries already avoid
  redundant rebuilds. Worker offloading: see the note below (attempted, blocked by tooling).
- [x] Accessibility: native `<input type="range">`/`<select>` for keyboard-operable
  timeline and speed controls, a keyboard-reachable "Jump to plate" `<select>` (3D canvas
  picking has no native keyboard equivalent), `aria-pressed`/`role="toolbar"`/
  `role="region"` across the toolbar/inspector/timeline/credits panel, `role="alert"`/
  `role="status"` for cut errors/busy state, a Space-bar play/pause shortcut, and
  `enableDamping` tied to `prefers-reduced-motion`. Lighthouse accessibility: 100/100.
- [x] Empty/error/loading states: loading spinner text + a non-crashing error message are
  already wired to `status` in the store; verified by aborting a data request in Playwright
  and confirming the app shows "Failed to load plate data" instead of a blank/broken page.
- [x] Cross-browser (Chromium/Firefox/WebKit) smoke-tested via Playwright — consistent
  rendering and interaction, no console errors. Lighthouse: 100/100/100 (accessibility/
  best-practices/SEO) on every run; performance 94/100 on the desktop preset (0.9s LCP,
  180ms TBT) vs. 59/100 on Lighthouse's default *mobile* preset (4x CPU + slow-4G
  throttling) — the gap is real three.js/WebGL script-evaluation cost under heavy
  throttling, not bloat (confirmed via `mainthread-work-breakdown`). Reasonable for a
  mouse-driven 3D editing tool; not chasing the mobile number further for v1.
- [x] `attribution.json` surfaced via `CreditsPanel` (bottom-right "Data & credits" button).
- [x] Playwright e2e suite (`e2e/*.spec.ts`, `npm run test:e2e`): reconstruction playback +
  tour + plate selection, sandbox drag/cut/undo, and export → reload → import round-trip.
  Runs `workers: 1` deliberately — real WebGL contexts in parallel against one dev server
  caused flaky timeouts, not real bugs (verified by re-running failures in isolation).
  Caught two real bugs in the process: `downloadProjectFile` revoked its Blob URL
  synchronously right after `a.click()`, racing the browser's async download start and
  sometimes cancelling it (fixed: defer the revoke); and turf's polygon-clipping code was
  statically imported into the main bundle even though it's Sandbox-only (fixed: lazily
  imported from the store/worker-client, cutting ~47KB off the initial JS payload).
- [x] Deployed to GitHub Pages via `.github/workflows/deploy.yml` (build + lint + test on
  every push to `main`, then `actions/deploy-pages`). `next.config.ts` picks up
  `NEXT_PUBLIC_BASE_PATH` (set by the workflow to `/<repo>`) so the static export works
  from a project subpath; `loadPlates.ts`'s runtime `fetch()` calls needed the same prefix
  applied manually, since Next's `basePath` only rewrites its own asset/routing system, not
  arbitrary absolute-path fetches. Verified locally by serving the build under a `/Geollage`
  subpath before pushing, and again against the live URL after deploy.
  **Live at https://nawat-john.github.io/Geollage/**
- [x] README: dev setup, scripts, data-refresh instructions, testing, deployment notes,
  known limitations.
- **Done when:** it's live, credited, and the two core features + export are robust. ✅

---

## 11. Data Licensing & Attribution (do not skip)

EarthByte / GPlates reconstruction models are published under open licenses (commonly GPL /
Creative Commons) **with citation requirements**. Because this is a public educational site:
- Store the exact **model name, authors, paper citation, and license** in `attribution.json`.
- Show them in an in-app "Data & credits" panel and the README.
- Confirm each chosen model's specific terms before shipping (they differ per model).

Representative models to cite as applicable: Merdith et al. 2021 / Cao et al. 2024,
Scotese PALEOMAP, Müller et al. 2019, Zahirovic et al. 2022.

---

## 12. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cutting arbitrary spherical polygons is fiddly (poles, antimeridian, concavity, self-touch). | Prefer robust **great-circle plane cut** in 3D; treat freehand as secondary; heavy unit tests; run in a worker. |
| R3F + Next SSR hydration errors. | Client-only scene via `dynamic(..., { ssr:false })`; never import three in server components. |
| Big geometry → slow load / low FPS. | Offline simplification, vertex budget, LOD, instancing, worker offload. |
| Reconstruction looks jumpy. | Interpolate **rotations (SLERP)**, not geometry; enough keyframe cadence. |
| Export files break across app versions. | `schemaVersion` + migrations + round-trip tests from day one. |
| Data license non-compliance. | Attribution panel + `attribution.json` gated in Phase 7 checklist. |

---

## 13. Stretch Goals (post-v1)
- Shareable read-only project link via URL-encoded (compressed) state — still no server.
- Record an animation to GIF/WebM.
- Paleo-coastlines / paleoclimate raster overlays per time.
- Measure tools (distance, plate velocity, convergence rate).
- Compare two rotation models side by side.
- VR/AR view of the globe.

---

## 14. Definition of Done (v1)
1. **Time Machine**: smooth, scientifically sourced playback ancient→present with epoch markers.
2. **Sandbox**: cut a plate into pieces and drag each piece freely on the globe, with undo.
3. **Export/Import**: save work to a file and fully restore it later, no backend.
4. Static build deployed; data properly credited; core flows covered by e2e tests.
