import {
  bbox,
  difference,
  featureCollection,
  flatten,
  multiPolygon,
  polygon,
  union,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { Vector3 } from "three";
import { createLocalProjection, type LocalProjection } from "./localProjection";
import { lonLatToVec3, vec3ToLonLat } from "./spherical";
import type { Ring } from "./triangulate";

/** Ensures a ring is closed (first point repeated at the end). */
function closeRing<T extends [number, number]>(ring: T[]): T[] {
  const [x0, y0] = ring[0];
  const [xn, yn] = ring[ring.length - 1];
  return x0 === xn && y0 === yn ? ring : [...ring, ring[0]];
}

function ringSignedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Turf/polygon-clipping expect CCW exterior rings. */
function ensureCcw(ring: [number, number][]): [number, number][] {
  return ringSignedArea(ring) < 0 ? [...ring].reverse() : ring;
}

function projectRingToPlane(
  ring: Ring,
  projection: LocalProjection,
): [number, number][] {
  const planar = ring.map(([lon, lat]) => {
    const { x, y } = projection.toPlane(lonLatToVec3(lon, lat));
    return [x, y] as [number, number];
  });
  return ensureCcw(closeRing(planar));
}

function buildMultiPolygon(
  rings: Ring[],
  projection: LocalProjection,
): Feature<MultiPolygon> {
  const coords = rings.map((ring) => [projectRingToPlane(ring, projection)]);
  return multiPolygon(coords);
}

/** A thin "sausage" polygon around a polyline, built with plain planar
 * geometry (not turf.buffer, which assumes real-world geographic units and
 * would misinterpret our tangent-plane radians as degrees). */
function bufferPolyline(
  points: [number, number][],
  eps: number,
): Feature<Polygon | MultiPolygon> | null {
  const quads: Feature<Polygon>[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-9;
    const nx = (-dy / len) * eps;
    const ny = (dx / len) * eps;
    quads.push(
      polygon([
        [
          [x1 + nx, y1 + ny],
          [x2 + nx, y2 + ny],
          [x2 - nx, y2 - ny],
          [x1 - nx, y1 - ny],
          [x1 + nx, y1 + ny],
        ],
      ]),
    );
  }
  // Square caps at every vertex so segment joints aren't left with gaps.
  for (const [x, y] of points) {
    quads.push(
      polygon([
        [
          [x - eps, y - eps],
          [x + eps, y - eps],
          [x + eps, y + eps],
          [x - eps, y + eps],
          [x - eps, y - eps],
        ],
      ]),
    );
  }
  if (quads.length === 0) return null;
  return union(featureCollection(quads));
}

export { greatCircleCutter } from "./greatCircle";

export interface CutResult {
  pieces: Ring[][]; // one entry per resulting plate, each a list of rings
}

/**
 * Splits a plate's rings along a cutter polyline (given as 3D unit-sphere
 * points). Works for both a great-circle cut (caller samples points along
 * the full great circle) and a freehand stroke (caller passes the raw drag
 * path). Returns null if the cutter didn't actually separate the geometry.
 */
export function cutRings(rings: Ring[], cutterPoints3D: Vector3[]): CutResult | null {
  if (rings.length === 0 || cutterPoints3D.length < 2) return null;

  const allPoints = [
    ...rings.flat().map(([lon, lat]) => lonLatToVec3(lon, lat)),
    ...cutterPoints3D,
  ];
  const projection = createLocalProjection(allPoints);

  const plateFeature = buildMultiPolygon(rings, projection);
  const cutterPlanar = cutterPoints3D.map((p) => {
    const { x, y } = projection.toPlane(p);
    return [x, y] as [number, number];
  });

  // Epsilon relative to the plate's own extent so the sliver reliably cuts
  // all the way through regardless of how big or small the plate is.
  const box = bbox(plateFeature);
  const extent = Math.max(box[2] - box[0], box[3] - box[1], 1e-3);
  const eps = extent * 0.01;

  const sliver = bufferPolyline(cutterPlanar, eps);
  if (!sliver) return null;

  let diff: Feature<Polygon | MultiPolygon> | null;
  try {
    diff = difference(featureCollection([plateFeature, sliver]));
  } catch {
    return null;
  }
  if (!diff) return null;

  const flattened = flatten(diff);
  if (flattened.features.length < 2) return null;

  const pieces: Ring[][] = flattened.features.map((feature) => {
    const exteriorRing = feature.geometry.coordinates[0];
    const ring: Ring = exteriorRing.map(([x, y]) => {
      const sphere = projection.toSphere(x, y);
      const [lon, lat] = vec3ToLonLat(sphere);
      return [lon, lat];
    });
    return [ring];
  });

  return { pieces };
}
