import { Vector3 } from "three";
import type { Ring } from "../geo/triangulate";
import { lonLatToVec3 } from "../geo/spherical";
import { pointOnPlate, type Plate } from "./plate";

const SAMPLES_PER_RING = 5;

// Keyed on the plate's rings array, which only changes when a cut creates new
// pieces — drags and imports of the same geometry reuse the result.
const cache = new WeakMap<Ring[], Ring[]>();

/**
 * Coastline polygons (present-day frame) that sit on this plate. GWS
 * coastlines carry no plate id, so a polygon belongs to whichever plate
 * contains a majority of a few sample vertices. Works the same for pieces
 * produced by a cut.
 * ponytail: a coastline crossing a cut stays whole on the piece holding most
 * of it; clip it against the cut line if that ever looks wrong.
 */
export function coastlinesForPlate(plate: Plate, coastlines: Ring[]): Ring[] {
  const cached = cache.get(plate.rings);
  if (cached) return cached;

  const result = coastlines.filter((ring) => {
    const step = Math.max(1, Math.floor(ring.length / SAMPLES_PER_RING));
    let hits = 0;
    let samples = 0;
    const v = new Vector3();
    for (let i = 0; i < ring.length && samples < SAMPLES_PER_RING; i += step, samples++) {
      if (pointOnPlate(plate, lonLatToVec3(ring[i][0], ring[i][1], 1, v))) hits++;
    }
    return hits * 2 > samples;
  });
  cache.set(plate.rings, result);
  return result;
}
