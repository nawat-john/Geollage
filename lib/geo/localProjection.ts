import { Vector3 } from "three";

export interface LocalProjection {
  centroid: Vector3;
  /** Azimuthal-equidistant forward projection: unit sphere point -> local plane. */
  toPlane(p: Vector3): { x: number; y: number };
  /** Inverse of toPlane: local plane point -> unit sphere point. */
  toSphere(x: number, y: number): Vector3;
}

/**
 * Builds an azimuthal-equidistant projection centered on the centroid of the
 * given points. Used to get well-behaved 2D coordinates for planar
 * algorithms (earcut, turf boolean ops) that have no notion of a sphere.
 */
export function createLocalProjection(points: Vector3[]): LocalProjection {
  const centroid = points
    .reduce((acc, p) => acc.add(p), new Vector3())
    .normalize();

  const upRef = Math.abs(centroid.y) > 0.999 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const east = upRef.clone().cross(centroid).normalize();
  const north = centroid.clone().cross(east).normalize();

  return {
    centroid,
    toPlane(p: Vector3) {
      const dot = Math.max(-1, Math.min(1, centroid.dot(p)));
      const theta = Math.acos(dot);
      const tangential = p.clone().sub(centroid.clone().multiplyScalar(dot));
      if (tangential.lengthSq() < 1e-12) return { x: 0, y: 0 };
      const dir = tangential.normalize();
      return { x: theta * dir.dot(east), y: theta * dir.dot(north) };
    },
    toSphere(x: number, y: number) {
      const theta = Math.sqrt(x * x + y * y);
      if (theta < 1e-12) return centroid.clone();
      const dir = east.clone().multiplyScalar(x / theta).add(north.clone().multiplyScalar(y / theta));
      return centroid
        .clone()
        .multiplyScalar(Math.cos(theta))
        .add(dir.multiplyScalar(Math.sin(theta)));
    },
  };
}
