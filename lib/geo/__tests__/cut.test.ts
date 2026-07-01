import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import { cutRings, greatCircleCutter } from "../cut";
import { lonLatToVec3 } from "../spherical";
import type { Ring } from "../triangulate";

function ringArea(ring: Ring): number {
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring
    : [...ring, ring[0]];
  return Math.abs(turf.area(turf.polygon([closed as [number, number][]])));
}

// A simple 20°x20° box centered on the equator/prime-meridian intersection —
// small enough that lon/lat area is a reasonable proxy for sphere area.
const box: Ring = [
  [-10, -10],
  [10, -10],
  [10, 10],
  [-10, 10],
  [-10, -10],
];

describe("cutRings", () => {
  it("splits a convex box in half with a great-circle cut through the middle", () => {
    const a = lonLatToVec3(0, -30);
    const b = lonLatToVec3(0, 30);
    const cutter = greatCircleCutter(a, b);

    const result = cutRings([box], cutter);
    expect(result).not.toBeNull();
    expect(result!.pieces.length).toBe(2);

    const originalArea = ringArea(box);
    const totalArea = result!.pieces.reduce(
      (sum, rings) => sum + rings.reduce((s, r) => s + ringArea(r), 0),
      0,
    );
    // Area is preserved (minus the thin sliver removed by the cut).
    expect(totalArea).toBeGreaterThan(originalArea * 0.95);
    expect(totalArea).toBeLessThanOrEqual(originalArea * 1.001);

    // Each piece should be roughly half the box.
    for (const rings of result!.pieces) {
      const area = rings.reduce((s, r) => s + ringArea(r), 0);
      expect(area).toBeGreaterThan(originalArea * 0.4);
      expect(area).toBeLessThan(originalArea * 0.6);
    }
  });

  it("returns null when the cutter misses the polygon entirely", () => {
    const a = lonLatToVec3(100, -30);
    const b = lonLatToVec3(100, 30);
    const cutter = greatCircleCutter(a, b);

    const result = cutRings([box], cutter);
    expect(result).toBeNull();
  });

  it("handles a concave (C-shaped / horseshoe) polygon", () => {
    // A horseshoe opening to the right, cut vertically through its middle.
    const horseshoe: Ring = [
      [-10, -10],
      [10, -10],
      [10, -4],
      [-4, -4],
      [-4, 4],
      [10, 4],
      [10, 10],
      [-10, 10],
      [-10, -10],
    ];

    const a = lonLatToVec3(0, -20);
    const b = lonLatToVec3(0, 20);
    const cutter = greatCircleCutter(a, b);

    const result = cutRings([horseshoe], cutter);
    expect(result).not.toBeNull();
    expect(result!.pieces.length).toBeGreaterThanOrEqual(2);

    const originalArea = ringArea(horseshoe);
    const totalArea = result!.pieces.reduce(
      (sum, rings) => sum + rings.reduce((s, r) => s + ringArea(r), 0),
      0,
    );
    expect(totalArea).toBeGreaterThan(originalArea * 0.9);
  });

  it("splits a multi-ring plate, keeping untouched rings intact", () => {
    const untouchedFarAway: Ring = [
      [100, 40],
      [105, 40],
      [105, 45],
      [100, 45],
      [100, 40],
    ];

    const a = lonLatToVec3(0, -30);
    const b = lonLatToVec3(0, 30);
    const cutter = greatCircleCutter(a, b);

    const result = cutRings([box, untouchedFarAway], cutter);
    expect(result).not.toBeNull();
    // box -> 2 pieces, untouched ring -> 1 piece, all disjoint => 3 total
    expect(result!.pieces.length).toBe(3);
  });
});
