import { Quaternion, Vector3 } from "three";
import { clamp, findBracket, lonLatToVec3, pointInSphericalPolygon, slerpQuat, vec3ToLonLat } from "../geo/spherical";
import type { Ring } from "../geo/triangulate";

export type Quat = [x: number, y: number, z: number, w: number];

export interface FiniteRotation {
  timeMa: number;
  quat: Quat; // absolute rotation, already flattened from any hierarchy
}

export interface Plate {
  id: string;
  plateId?: number;
  name: string;
  rings: Ring[]; // present-day geometry (reference frame)
  color: string;
  rotations: FiniteRotation[]; // reconstruction keyframes, sorted by timeMa
  userTransform?: Quat; // sandbox: extra rotation the user applied by dragging
  derivedFrom?: string; // if created by a cut, the parent plate id
}

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

/**
 * Orientation of a plate at a given geological time: the reconstruction
 * keyframes (SLERPed) composed with any sandbox drag the user applied on
 * top. Falls back to identity when the plate has no rotation history (pure
 * sandbox plates) and/or no user transform.
 */
export function orientationAtTime(plate: Plate, timeMa: number): Quaternion {
  const base = baseOrientationAtTime(plate, timeMa);
  if (!plate.userTransform) return base;
  const user = new Quaternion(...plate.userTransform);
  return user.multiply(base);
}

export function baseOrientationAtTime(plate: Plate, timeMa: number): Quaternion {
  const { rotations } = plate;
  if (rotations.length === 0) return new Quaternion();

  const times = rotations.map((r) => r.timeMa);
  const { i0, i1, t } = findBracket(times, timeMa);
  const q0 = new Quaternion(...rotations[i0].quat);
  if (i0 === i1) return q0;
  const q1 = new Quaternion(...rotations[i1].quat);
  return slerpQuat(q0, q1, t);
}

export function isIdentityQuat(q: Quat): boolean {
  return q[0] === 0 && q[1] === 0 && q[2] === 0 && q[3] === 1;
}

export interface InstantaneousMotion {
  poleLon: number;
  poleLat: number;
  degPerMyr: number;
}

/**
 * Approximates the plate's current Euler pole and angular speed by
 * comparing its reconstruction orientation one million years apart —
 * a teaching overlay, not a claim about the underlying finite-rotation
 * model's exact instantaneous pole. Returns null for plates with fewer
 * than two rotation keyframes (nothing to differentiate).
 */
export function instantaneousMotion(plate: Plate, timeMa: number): InstantaneousMotion | null {
  if (plate.rotations.length < 2) return null;

  const dtMa = 1;
  const q1 = baseOrientationAtTime(plate, timeMa);
  const q2 = baseOrientationAtTime(plate, timeMa + dtMa);
  const delta = q2.clone().multiply(q1.clone().invert());

  const angleRad = 2 * Math.acos(clamp(delta.w, -1, 1));
  if (angleRad < 1e-9) return null;

  const sinHalf = Math.sqrt(Math.max(0, 1 - delta.w * delta.w));
  const axis =
    sinHalf < 1e-9
      ? new Vector3(0, 1, 0)
      : new Vector3(delta.x, delta.y, delta.z).divideScalar(sinHalf);

  const [poleLon, poleLat] = vec3ToLonLat(axis.normalize());
  return { poleLon, poleLat, degPerMyr: ((angleRad * 180) / Math.PI) / dtMa };
}

const EARTH_RADIUS_KM = 6371;

/** Unit vector at the vertex average of the plate's first ring, in the
 * plate's own (present-day) frame — a cheap "middle of the plate" anchor
 * for labels and arrows. */
export function plateCentroid(plate: Plate): Vector3 {
  return plate.rings[0]
    .reduce((acc, [lon, lat]) => acc.add(lonLatToVec3(lon, lat)), new Vector3())
    .normalize();
}

interface RingShape {
  verts: Vector3[];
  mean: Vector3;
  center: Vector3;
  cosRadius: number; // cos of the angular radius of a cap bounding the ring
}

const shapeCache = new WeakMap<Ring[], RingShape[]>();

function plateShape(rings: Ring[]): RingShape[] {
  let shape = shapeCache.get(rings);
  if (!shape) {
    shape = rings.map((ring) => {
      const verts = ring.map(([lon, lat]) => lonLatToVec3(lon, lat, 1));
      const mean = verts.reduce((acc, v) => acc.add(v), new Vector3());
      const center = mean.clone().normalize();
      const cosRadius = Math.min(...verts.map((v) => v.dot(center))) - 1e-6;
      return { verts, mean, center, cosRadius };
    });
    shapeCache.set(rings, shape);
  }
  return shape;
}

/** Whether a present-day-frame unit vector falls on this plate. */
export function pointOnPlate(plate: Plate, local: Vector3): boolean {
  return plateShape(plate.rings).some(
    (r) => local.dot(r.center) >= r.cosRadius && pointInSphericalPolygon(local, r.verts, r.mean),
  );
}

/**
 * Surface velocity of a plate-fixed point at `timeMa`, going forward in
 * geological time (older -> younger), as a world-space unit direction plus
 * speed in cm/yr. Null when the plate isn't moving (or has no keyframes).
 */
export function surfaceVelocity(
  plate: Plate,
  local: Vector3,
  timeMa: number,
): { position: Vector3; direction: Vector3; cmPerYr: number } | null {
  if (plate.rotations.length < 2) return null;
  const dtMa = 1;
  const position = local.clone().applyQuaternion(orientationAtTime(plate, timeMa));
  const earlier = local.clone().applyQuaternion(orientationAtTime(plate, timeMa + dtMa));
  const angleRad = earlier.angleTo(position);
  if (!(angleRad > 1e-9)) return null;
  // Arc length in km per Myr is numerically mm/yr; /10 for cm/yr.
  const cmPerYr = (angleRad * EARTH_RADIUS_KM) / dtMa / 10;
  const direction = position.clone().sub(earlier).normalize();
  return { position, direction, cmPerYr };
}

export { IDENTITY_QUAT };
