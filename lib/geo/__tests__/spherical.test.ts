import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  findBracket,
  incrementalDragRotation,
  lonLatToVec3,
  pointInSphericalRing,
  slerpQuat,
  vec3ToLonLat,
} from "../spherical";

describe("lonLatToVec3 / vec3ToLonLat", () => {
  it("round-trips a grid of lon/lat points", () => {
    for (let lon = -180; lon <= 180; lon += 37) {
      for (let lat = -80; lat <= 80; lat += 23) {
        const v = lonLatToVec3(lon, lat);
        expect(v.length()).toBeCloseTo(1, 10);
        const [lon2, lat2] = vec3ToLonLat(v);
        expect(lat2).toBeCloseTo(lat, 6);
        // Longitude is only meaningful away from the poles.
        if (Math.abs(lat) < 89) {
          const normalizedDelta =
            ((((lon2 - lon) % 360) + 540) % 360) - 180;
          expect(normalizedDelta).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it("places the north pole at +Y and equator on the XZ plane", () => {
    const north = lonLatToVec3(0, 90);
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.y).toBeCloseTo(1, 10);
    expect(north.z).toBeCloseTo(0, 10);

    const onEquator = lonLatToVec3(45, 0);
    expect(onEquator.y).toBeCloseTo(0, 10);
    expect(onEquator.length()).toBeCloseTo(1, 10);
  });
});

describe("slerpQuat", () => {
  it("returns the start at t=0 and end at t=1", () => {
    const a = new Quaternion(0, 0, 0, 1);
    const b = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    expect(slerpQuat(a, b, 0).equals(a)).toBe(true);
    expect(slerpQuat(a, b, 1).equals(b)).toBe(true);
  });

  it("interpolates halfway to half the angle", () => {
    const a = new Quaternion();
    const b = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const mid = slerpQuat(a, b, 0.5);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(mid.w)));
    expect(angle).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe("incrementalDragRotation", () => {
  it("free mode: rotates from-point exactly onto to-point", () => {
    const from = lonLatToVec3(0, 0);
    const to = lonLatToVec3(30, 10);
    const q = incrementalDragRotation(from, to);
    expect(q).not.toBeNull();
    const rotated = from.clone().applyQuaternion(q!);
    expect(rotated.x).toBeCloseTo(to.x, 6);
    expect(rotated.y).toBeCloseTo(to.y, 6);
    expect(rotated.z).toBeCloseTo(to.z, 6);
  });

  it("free mode: returns null for coincident points (no defined axis)", () => {
    const p = lonLatToVec3(12, 34);
    expect(incrementalDragRotation(p, p.clone())).toBeNull();
  });

  it("pole mode: rotates strictly about the fixed pole regardless of point latitude drift", () => {
    const pole = new Vector3(0, 1, 0); // north pole axis
    const from = lonLatToVec3(0, 20);
    const to = lonLatToVec3(45, 60); // different latitude — should be ignored, only azimuth matters
    const q = incrementalDragRotation(from, to, pole);
    expect(q).not.toBeNull();
    // Rotation about Y should not change latitude (Y component) of `from`.
    const rotated = from.clone().applyQuaternion(q!);
    expect(rotated.y).toBeCloseTo(from.y, 6);
    // And the swept angle should match the pure azimuth difference (45°).
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q!.w)));
    expect((angle * 180) / Math.PI).toBeCloseTo(45, 3);
  });

  it("pole mode: null when a point sits on the pole itself", () => {
    const pole = new Vector3(0, 1, 0);
    const north = lonLatToVec3(0, 90);
    const somewhere = lonLatToVec3(10, 10);
    expect(incrementalDragRotation(north, somewhere, pole)).toBeNull();
  });
});

describe("findBracket", () => {
  const times = [0, 10, 20, 30, 40];

  it("clamps below the first keyframe", () => {
    expect(findBracket(times, -5)).toEqual({ i0: 0, i1: 0, t: 0 });
  });

  it("clamps above the last keyframe", () => {
    expect(findBracket(times, 45)).toEqual({ i0: 4, i1: 4, t: 0 });
  });

  it("finds the bracket and interpolation factor mid-range", () => {
    expect(findBracket(times, 25)).toEqual({ i0: 2, i1: 3, t: 0.5 });
  });

  it("lands exactly on a keyframe", () => {
    expect(findBracket(times, 20)).toEqual({ i0: 2, i1: 3, t: 0 });
  });
});

describe("pointInSphericalRing", () => {
  it("handles a ring straddling the antimeridian", () => {
    const ring: [number, number][] = [[170, -10], [-170, -10], [-170, 10], [170, 10]];
    expect(pointInSphericalRing(lonLatToVec3(180, 0), ring)).toBe(true);
    expect(pointInSphericalRing(lonLatToVec3(0, 0), ring)).toBe(false);
    expect(pointInSphericalRing(lonLatToVec3(160, 0), ring)).toBe(false);
  });

  it("handles a polar cap ring that runs to the pole along the seam", () => {
    const ring: [number, number][] = [[-180, -60], [-90, -60], [0, -60], [90, -60], [180, -60], [180, -90], [-180, -90]];
    expect(pointInSphericalRing(lonLatToVec3(45, -80), ring)).toBe(true);
    expect(pointInSphericalRing(lonLatToVec3(45, -40), ring)).toBe(false);
  });
});
