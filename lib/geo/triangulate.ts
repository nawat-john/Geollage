import earcut from "earcut";
import { Vector3 } from "three";
import { createLocalProjection } from "./localProjection";
import { GLOBE_RADIUS, lonLatToVec3 } from "./spherical";

export type Ring = [lon: number, lat: number][];

export interface MeshData {
  positions: Float32Array; // xyz per vertex
  normals: Float32Array; // xyz per vertex (== normalized position, sphere is centered at origin)
  indices: Uint32Array;
}

const MAX_EDGE_STEP_RAD = (3 * Math.PI) / 180; // densify ring edges longer than ~3°
const MAX_TRI_SPAN_RAD = (6 * Math.PI) / 180; // subdivide triangles wider than ~6°
const DUPLICATE_EPS = 1e-9; // squared distance below which consecutive points are the same

/**
 * Collapses consecutive (including wrap-around) duplicate points. Polygons
 * that touch a pole sometimes represent it as several vertices at the exact
 * same 3D location with different (meaningless, at the pole) longitudes —
 * e.g. [-180,90], [180,90], [-180,90]. Left in, these zero-length edges
 * destabilize the local-plane projection used for triangulation.
 */
function dedupe(points: Vector3[]): Vector3[] {
  const out: Vector3[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || prev.distanceToSquared(p) > DUPLICATE_EPS) out.push(p);
  }
  while (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) <= DUPLICATE_EPS) {
    out.pop();
  }
  return out;
}

/**
 * Inserts SLERP-interpolated points into long edges so consecutive vertices
 * never subtend more than MAX_EDGE_STEP_RAD. Long straight-line edges (left
 * behind by simplification, e.g. across open ocean) deviate from the true
 * great-circle arc enough that the local tangent-plane projection below can
 * lose simplicity — self-intersect — even though the underlying spherical
 * polygon does not. Densifying keeps the straight-line-in-projection
 * approximation faithful to the geodesic.
 */
function densify(points: Vector3[]): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push(a);
    const dot = Math.max(-1, Math.min(1, a.dot(b)));
    const theta = Math.acos(dot);
    if (theta <= MAX_EDGE_STEP_RAD || theta === 0) continue;
    const steps = Math.ceil(theta / MAX_EDGE_STEP_RAD);
    const sinTheta = Math.sin(theta);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const wa = Math.sin((1 - t) * theta) / sinTheta;
      const wb = Math.sin(t * theta) / sinTheta;
      out.push(
        new Vector3(
          a.x * wa + b.x * wb,
          a.y * wa + b.y * wb,
          a.z * wa + b.z * wb,
        ).normalize(),
      );
    }
  }
  return out;
}

/**
 * Splits any triangle whose vertices span more than MAX_TRI_SPAN_RAD into 4
 * sub-triangles (edge-midpoint quadrisection, midpoints re-normalized onto
 * the sphere), recursively. Earcut triangulates in a flat 2D projection, so
 * for concave outlines (real coastlines) it sometimes has to reach for a
 * long diagonal between vertices that are far apart on the sphere. Rendered
 * as a single flat triangle, that chord sags well below the sphere's
 * surface — for a 40°-wide triangle, over 6% of the radius — sinking under
 * the opaque base globe and reading as a hole. Subdividing keeps every
 * triangle's chord sag imperceptible.
 */
function subdivideLargeTriangles(
  verts: Vector3[],
  indices: number[],
): number[] {
  const midpointCache = new Map<string, number>();

  function midpoint(i: number, j: number): number {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    const cached = midpointCache.get(key);
    if (cached !== undefined) return cached;
    const mid = verts[i].clone().add(verts[j]).normalize();
    verts.push(mid);
    const idx = verts.length - 1;
    midpointCache.set(key, idx);
    return idx;
  }

  function angularSpan(a: number, b: number, c: number): number {
    const va = verts[a], vb = verts[b], vc = verts[c];
    return Math.max(va.angleTo(vb), vb.angleTo(vc), vc.angleTo(va));
  }

  const out: number[] = [];
  function recurse(a: number, b: number, c: number, depth: number) {
    if (angularSpan(a, b, c) <= MAX_TRI_SPAN_RAD || depth >= 6) {
      out.push(a, b, c);
      return;
    }
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    recurse(a, ab, ca, depth + 1);
    recurse(ab, b, bc, depth + 1);
    recurse(ca, bc, c, depth + 1);
    recurse(ab, bc, ca, depth + 1);
  }

  for (let i = 0; i < indices.length; i += 3) {
    recurse(indices[i], indices[i + 1], indices[i + 2], 0);
  }
  return out;
}

/** Triangulates a single closed ring of [lon, lat] vertices onto the sphere. */
export function triangulateRing(
  ring: Ring,
  radius: number = GLOBE_RADIUS,
): MeshData {
  // Drop an explicit closing vertex (first === last) if present; earcut
  // expects an open ring.
  const isClosed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const openRing = isClosed ? ring.slice(0, -1) : ring;

  const rawPoints = openRing.map(([lon, lat]) => lonLatToVec3(lon, lat, 1));
  const points = densify(dedupe(rawPoints));

  const projection = createLocalProjection(points);
  const flat = new Array(points.length * 2);
  points.forEach((p, i) => {
    const { x, y } = projection.toPlane(p);
    flat[i * 2] = x;
    flat[i * 2 + 1] = y;
  });

  const earTriangles = earcut(flat);

  // Subdivision can add vertices, so work with a growable array of Vector3
  // and re-flatten to typed arrays afterwards.
  const verts = points.slice();
  const indices = subdivideLargeTriangles(verts, earTriangles);

  const positions = new Float32Array(verts.length * 3);
  const normals = new Float32Array(verts.length * 3);
  verts.forEach((p, i) => {
    positions[i * 3] = p.x * radius;
    positions[i * 3 + 1] = p.y * radius;
    positions[i * 3 + 2] = p.z * radius;
    normals[i * 3] = p.x;
    normals[i * 3 + 1] = p.y;
    normals[i * 3 + 2] = p.z;
  });

  return { positions, normals, indices: Uint32Array.from(indices) };
}

/** Triangulates every (disjoint) ring of a plate and merges into one mesh. */
export function triangulateRings(
  rings: Ring[],
  radius: number = GLOBE_RADIUS,
): MeshData {
  const parts = rings.map((ring) => triangulateRing(ring, radius));

  const totalVerts = parts.reduce((n, p) => n + p.positions.length / 3, 0);
  const totalIndices = parts.reduce((n, p) => n + p.indices.length, 0);

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vertOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vertOffset * 3);
    normals.set(part.normals, vertOffset * 3);
    for (let i = 0; i < part.indices.length; i++) {
      indices[indexOffset + i] = part.indices[i] + vertOffset;
    }
    vertOffset += part.positions.length / 3;
    indexOffset += part.indices.length;
  }

  return { positions, normals, indices };
}
