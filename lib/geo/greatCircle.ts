import { Vector3 } from "three";

/**
 * Samples a dense arc along the full great circle through two clicked
 * points, wide enough to cross clear through any plate-sized polygon. Split
 * out of cut.ts (which pulls in turf) because this is pure three.js math and
 * used synchronously from the store when placing the first/second cut click.
 */
export function greatCircleCutter(a: Vector3, b: Vector3, samples = 90): Vector3[] {
  const normal = new Vector3().crossVectors(a, b).normalize();
  const u = a.clone().normalize();
  const v = new Vector3().crossVectors(normal, u).normalize();
  const mid = Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))) / 2;
  const start = mid - (Math.PI * 2) / 3;
  const end = mid + (Math.PI * 2) / 3;
  const points: Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const theta = start + ((end - start) * i) / samples;
    points.push(
      u.clone().multiplyScalar(Math.cos(theta)).add(v.clone().multiplyScalar(Math.sin(theta))),
    );
  }
  return points;
}
