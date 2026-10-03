// One-off data pipeline: fetch present-day plate topology + finite rotations
// from the GPlates Web Service and emit static JSON assets under /public/data.
//
// Run with: npm run preprocess (via tsx, so it can reuse the app's TS geometry code)
import { area, featureCollection, polygon, simplify, union } from "@turf/turf";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lonLatToVec3 } from "../../lib/geo/spherical.ts";
import { pointOnPlate } from "../../lib/model/plate.ts";

const GWS = "https://gws.gplates.org";
const MODEL = "MERDITH2021";
const MODEL_TIMESPAN = { minMa: 0, maxMa: 1800 };
const ROTATION_STEP_MA = 10;
const SIMPLIFY_TOLERANCE_DEG = 0.05; // ~5km at the equator; keeps coastlines recognizable
const COAST_SIMPLIFY_TOLERANCE_DEG = 0.15;
const COAST_MIN_AREA_KM2 = 4000; // drops thousands of tiny islets nobody can see at globe scale
const COAST_PREFILTER_KM2 = 50; // specks not worth feeding to the union

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "data",
);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Evenly spaced, readable hues around the color wheel, one per plate.
function colorForIndex(index, total) {
  const hue = Math.round((360 * index) / total);
  return `hsl(${hue}, 62%, 55%)`;
}

// Raw GPlates feature names carry model codes ("Africa AFR_001_000",
// "NAM_001_000"); strip them to something a student would recognize.
const NAME_BY_CODE = { NAM: "North America", SAM: "South America" };
const NAME_OVERRIDES = { NFB: "North Fiji Basin", JUAN_DE_FUCA_11Ma_0Ma: "Juan de Fuca" };
function cleanName(raw) {
  if (NAME_OVERRIDES[raw]) return NAME_OVERRIDES[raw];
  const code = raw.match(/^([A-Z]{3})_\d+_\d+$/);
  if (code && NAME_BY_CODE[code[1]]) return NAME_BY_CODE[code[1]];
  return raw
    .replace(/\s*\(.*\)$/, "")
    .replace(/\s+[A-Z]{3}_\d+_\d+$/, "")
    .replace(/_\d+_\d+$/, "")
    .replace(/(\s+(from PB03 GS|NW15|Plate|plate))+$/, "");
}

function simplifyRing(ring, tolerance = SIMPLIFY_TOLERANCE_DEG) {
  if (ring.length <= 20) return ring;
  const feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
  const simplified = simplify(feature, {
    tolerance,
    highQuality: true,
  });
  const [outRing] = simplified.geometry.coordinates;
  // Never simplify a ring down to degeneracy.
  return outRing.length >= 4 ? outRing : ring;
}

function polygonRings(geometry) {
  // Returns the outer ring of every polygon part (ignores holes: plate
  // topologies from GWS are exterior-only in practice).
  const polygons =
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polygons.map((poly) => simplifyRing(poly[0]));
}

async function fetchPresentDayPlates() {
  console.log(`Fetching present-day topological plate polygons (${MODEL})...`);
  const fc = await fetchJson(
    `${GWS}/topology/plate_polygons/?time=0&model=${MODEL}`,
  );

  const plates = fc.features.map((feature, index) => {
    const pid = feature.properties.pid;
    const name = cleanName(feature.properties.name ?? `Plate ${pid}`);
    return {
      id: `plate-${pid}`,
      plateId: pid,
      name,
      rings: polygonRings(feature.geometry),
      color: colorForIndex(index, fc.features.length),
    };
  });

  console.log(`  -> ${plates.length} plates`);
  return plates;
}

async function fetchRotations(plateIds) {
  console.log(
    `Fetching finite rotations for ${plateIds.length} plates, ` +
      `0-${MODEL_TIMESPAN.maxMa}Ma every ${ROTATION_STEP_MA}Ma...`,
  );

  const times = [];
  for (let t = MODEL_TIMESPAN.minMa; t <= MODEL_TIMESPAN.maxMa; t += ROTATION_STEP_MA) {
    times.push(t);
  }

  const url = new URL(`${GWS}/rotation/get_quaternions`);
  url.searchParams.set("times", times.join(","));
  url.searchParams.set("pids", plateIds.join(","));
  url.searchParams.set("model", MODEL);
  // Deliberately NOT using group_by_pid=1: that response is a bare array per
  // pid, and empirically its element order does not always match the order
  // of the requested `times` list (verified against single-time requests) —
  // using it silently mislabeled rotation keyframes with the wrong age. The
  // ungrouped response keys each quaternion by its actual time string, which
  // is unambiguous, so we key off that instead of array position.
  const byTime = await fetchJson(url);

  /** @type {Record<string, {timeMa: number, quat: [number,number,number,number]}[]>} */
  const rotations = {};
  for (const pid of plateIds) rotations[pid] = [];

  for (const [timeKey, byPid] of Object.entries(byTime)) {
    const timeMa = Number(timeKey);
    for (const pid of plateIds) {
      const quat = byPid[String(pid)];
      if (!quat) continue;
      const [w, x, y, z] = quat;
      // GWS returns scalar-first [w,x,y,z]; three.js Quaternion is [x,y,z,w].
      rotations[pid].push({ timeMa, quat: [x, y, z, w] });
    }
  }
  for (const pid of plateIds) {
    rotations[pid].sort((a, b) => a.timeMa - b.timeMa);
    if (rotations[pid].length !== times.length) {
      console.warn(
        `  ! plate ${pid}: expected ${times.length} keyframes, got ${rotations[pid].length}`,
      );
    }
  }

  return rotations;
}

function majorityPlate(ring, plates) {
  const SAMPLES = 7;
  const step = Math.max(1, Math.floor(ring.length / SAMPLES));
  const votes = new Map();
  for (let i = 0; i < ring.length; i += step) {
    const v = lonLatToVec3(ring[i][0], ring[i][1], 1);
    const plate = plates.find((p) => pointOnPlate(p, v));
    if (plate) votes.set(plate.plateId, (votes.get(plate.plateId) ?? 0) + 1);
  }
  let best = null;
  for (const [pid, n] of votes) if (best === null || n > votes.get(best)) best = pid;
  return best ?? "none";
}

// GWS coastlines come as thousands of terrane polygons with no plate id.
// Simplifying neighbours independently opens hairline gaps along their shared
// edges, so: group by the plate each sits on, union per plate (never across
// plates, or India would weld onto Eurasia), then simplify the merged shapes.
// The app re-assigns polygons to plates at load time, which also covers cuts.
async function fetchCoastlines(plates) {
  console.log(`Fetching present-day coastlines (${MODEL})...`);
  const fc = await fetchJson(`${GWS}/reconstruct/coastlines/?time=0&model=${MODEL}`);
  const groups = new Map();
  for (const feature of fc.features) {
    const g = feature.geometry;
    const polygons = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    for (const poly of polygons) {
      const outer = poly[0];
      if (outer.length < 4 || area(polygon([outer])) / 1e6 < COAST_PREFILTER_KM2) continue;
      const pid = majorityPlate(outer, plates);
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid).push(polygon([outer]));
    }
  }

  const rings = [];
  for (const [pid, polys] of groups) {
    const merged = polys.length > 1 ? union(featureCollection(polys)) : polys[0];
    if (!merged) continue;
    const g = merged.geometry;
    const parts = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    let kept = 0;
    for (const part of parts) {
      if (area(polygon([part[0]])) / 1e6 < COAST_MIN_AREA_KM2) continue;
      const ring = simplifyRing(part[0], COAST_SIMPLIFY_TOLERANCE_DEG).map(([lon, lat]) => [
        Math.round(lon * 100) / 100,
        Math.round(lat * 100) / 100,
      ]);
      if (ring.length >= 4) {
        rings.push(ring);
        kept++;
      }
    }
    console.log(`  plate ${pid}: ${polys.length} terranes -> ${kept} land polygons`);
  }
  console.log(`  -> ${rings.length} coastline polygons`);
  return rings;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const plates = await fetchPresentDayPlates();
  const rotations = await fetchRotations(plates.map((p) => p.plateId));
  const coastlines = await fetchCoastlines(plates);

  const platesGeoJson = {
    format: "tecto-studio-plates",
    schemaVersion: 1,
    model: MODEL,
    plates,
  };

  const rotationsJson = {
    format: "tecto-studio-rotations",
    schemaVersion: 1,
    model: MODEL,
    timespan: MODEL_TIMESPAN,
    stepMa: ROTATION_STEP_MA,
    rotations,
  };

  const attribution = {
    model: MODEL,
    title: "Merdith et al. 2021 (extended to 1.8 Ga)",
    citation:
      "Merdith, A.S., Williams, S.E., Collins, A.S., et al. (2021). " +
      "Extending full-plate tectonic models into deep time: Linking the Neoproterozoic " +
      "and the Phanerozoic. Earth-Science Reviews, 214, 103477. " +
      "https://doi.org/10.1016/j.earscirev.2020.103477",
    dataService: "GPlates Web Service (https://gws.gplates.org), gwsdoc.gplates.org",
    license:
      "EarthByte / GPlates reconstruction data — verify current terms at " +
      "https://www.earthbyte.org before redistribution.",
    fetchedAt: new Date().toISOString(),
  };

  await writeFile(
    path.join(OUT_DIR, "plates.geo.json"),
    JSON.stringify(platesGeoJson),
  );
  await writeFile(
    path.join(OUT_DIR, "rotations.json"),
    JSON.stringify(rotationsJson),
  );
  await writeFile(
    path.join(OUT_DIR, "coastlines.json"),
    JSON.stringify({ format: "tecto-studio-coastlines", schemaVersion: 1, model: MODEL, rings: coastlines }),
  );
  await writeFile(
    path.join(OUT_DIR, "attribution.json"),
    JSON.stringify(attribution, null, 2),
  );

  console.log(`Wrote plates.geo.json, rotations.json, coastlines.json, attribution.json -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
