import { Quaternion, Vector3 } from "three";
import { clamp, findBracket, slerpQuat, vec3ToLonLat } from "../geo/spherical";
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

function baseOrientationAtTime(plate: Plate, timeMa: number): Quaternion {
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

export { IDENTITY_QUAT };
