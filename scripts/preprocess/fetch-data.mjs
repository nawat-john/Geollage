// One-off data pipeline: fetch present-day plate topology + finite rotations
// from the GPlates Web Service and emit static JSON assets under /public/data.
//
// Run with: node scripts/preprocess/fetch-data.mjs
import { simplify } from "@turf/turf";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GWS = "https://gws.gplates.org";
const MODEL = "MERDITH2021";
const MODEL_TIMESPAN = { minMa: 0, maxMa: 1800 };
const ROTATION_STEP_MA = 10;
const SIMPLIFY_TOLERANCE_DEG = 0.05; // ~5km at the equator; keeps coastlines recognizable

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

function simplifyRing(ring) {
  if (ring.length <= 20) return ring;
  const feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
  const simplified = simplify(feature, {
    tolerance: SIMPLIFY_TOLERANCE_DEG,
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
    const name = feature.properties.name ?? `Plate ${pid}`;
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const plates = await fetchPresentDayPlates();
  const rotations = await fetchRotations(plates.map((p) => p.plateId));

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
    path.join(OUT_DIR, "attribution.json"),
    JSON.stringify(attribution, null, 2),
  );

  console.log(`Wrote plates.geo.json, rotations.json, attribution.json -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
