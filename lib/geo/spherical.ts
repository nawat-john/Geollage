import { Quaternion, Vector3 } from "three";

export const GLOBE_RADIUS = 1;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** lon/lat in degrees -> unit-sphere position (three.js Y-up convention). */
export function lonLatToVec3(
  lon: number,
  lat: number,
  radius: number = GLOBE_RADIUS,
  target: Vector3 = new Vector3(),
): Vector3 {
  const lonRad = degToRad(lon);
  const latRad = degToRad(lat);
  const cosLat = Math.cos(latRad);
  return target.set(
    radius * cosLat * Math.cos(lonRad),
    radius * Math.sin(latRad),
    -radius * cosLat * Math.sin(lonRad),
  );
}

/** Unit-sphere position -> [lon, lat] in degrees. */
export function vec3ToLonLat(v: Vector3): [lon: number, lat: number] {
  const radius = v.length();
  const lat = Math.asin(clamp(v.y / radius, -1, 1));
  const lon = Math.atan2(-v.z, v.x);
  return [radToDeg(lon), radToDeg(lat)];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** SLERP between two rotation keyframes; returns a new Quaternion. */
export function slerpQuat(a: Quaternion, b: Quaternion, t: number): Quaternion {
  return a.clone().slerp(b, clamp(t, 0, 1));
}

/**
 * Given sorted keyframes (ascending timeMa) and a query time, find the
 * bracketing pair and interpolation factor. Clamps at both ends.
 */
export function findBracket(
  timesMa: readonly number[],
  timeMa: number,
): { i0: number; i1: number; t: number } {
  const n = timesMa.length;
  if (n === 0) throw new Error("findBracket: empty keyframe list");
  if (n === 1 || timeMa <= timesMa[0]) return { i0: 0, i1: 0, t: 0 };
  if (timeMa >= timesMa[n - 1]) return { i0: n - 1, i1: n - 1, t: 0 };

  // Keyframes are emitted at a fixed cadence, so this is a direct index guess
  // refined by a small linear search — no need for a full binary search.
  let i = Math.floor(
    ((timeMa - timesMa[0]) / (timesMa[n - 1] - timesMa[0])) * (n - 1),
  );
  i = Math.max(0, Math.min(n - 2, i));
  while (i > 0 && timesMa[i] > timeMa) i--;
  while (i < n - 2 && timesMa[i + 1] < timeMa) i++;

  const span = timesMa[i + 1] - timesMa[i];
  const t = span === 0 ? 0 : (timeMa - timesMa[i]) / span;
  return { i0: i, i1: i + 1, t };
}

/** Rotation quaternion that takes unit vector `from` to unit vector `to`. */
export function quatBetweenVectors(from: Vector3, to: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(
    from.clone().normalize(),
    to.clone().normalize(),
  );
}

/**
 * The incremental world-space rotation for one frame of a sandbox drag,
 * from the sphere point under the cursor last frame (`from`) to this frame
 * (`to`). In free mode this is the natural "grab the globe and slide it"
 * rotation about `from × to`. In pole mode the axis is pinned to
 * `poleAxis` and only the swept angle around that fixed axis is used —
 * this is the teaching mode for rotating strictly about a chosen Euler pole.
 * Returns null when the two points are (numerically) the same, since no
 * rotation axis can be derived.
 */
export function incrementalDragRotation(
  from: Vector3,
  to: Vector3,
  poleAxis?: Vector3,
): Quaternion | null {
  if (!poleAxis) {
    const axis = new Vector3().crossVectors(from, to);
    if (axis.lengthSq() < 1e-12) return null;
    axis.normalize();
    const angle = Math.acos(clamp(from.clone().normalize().dot(to.clone().normalize()), -1, 1));
    return new Quaternion().setFromAxisAngle(axis, angle);
  }

  const pole = poleAxis.clone().normalize();
  const project = (v: Vector3) => {
    const d = v.dot(pole);
    return v.clone().sub(pole.clone().multiplyScalar(d));
  };
  const pFrom = project(from);
  const pTo = project(to);
  if (pFrom.lengthSq() < 1e-12 || pTo.lengthSq() < 1e-12) return null;
  pFrom.normalize();
  pTo.normalize();

  const cross = new Vector3().crossVectors(pFrom, pTo);
  const sinAngle = cross.dot(pole);
  const cosAngle = clamp(pFrom.dot(pTo), -1, 1);
  const angle = Math.atan2(sinAngle, cosAngle);
  return new Quaternion().setFromAxisAngle(pole, angle);
}
