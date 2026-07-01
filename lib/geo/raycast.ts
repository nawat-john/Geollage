import type { Ray } from "three";
import { Vector3 } from "three";

/**
 * Nearest intersection of a ray with a sphere of the given radius centered
 * at the origin, or null if the ray misses it.
 */
export function raySphereIntersection(ray: Ray, radius: number): Vector3 | null {
  const origin = ray.origin;
  const direction = ray.direction; // assumed normalized (three.js Raycaster guarantees this)

  const b = 2 * origin.dot(direction);
  const c = origin.dot(origin) - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) return null;

  const sqrtDisc = Math.sqrt(discriminant);
  const t0 = (-b - sqrtDisc) / 2;
  const t1 = (-b + sqrtDisc) / 2;
  const t = t0 >= 0 ? t0 : t1;
  if (t < 0) return null;

  return origin.clone().add(direction.clone().multiplyScalar(t));
}
