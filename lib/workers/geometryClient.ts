import type { Ring } from "../geo/triangulate";

/**
 * Intended to run the polygon split in a Web Worker (per the project plan),
 * kept async so the call site and busy-state UI don't need to change if that
 * lands later. As of Next.js 16.2.9, Turbopack's `new Worker(new URL(...))`
 * pattern doesn't compile the target file — even a zero-dependency worker
 * gets emitted as a raw, unprocessed `.ts` static asset — so for now this
 * runs on the main thread. `cutRings` operates on a few hundred vertices per
 * plate and completes in low single-digit milliseconds, so this is not
 * currently a jank source; revisit if plates/cuts grow much larger.
 *
 * `cutRings` pulls in turf's polygon-clipping code, which is sizeable and
 * only relevant to Sandbox users — importing it dynamically here keeps it
 * out of the initial bundle everyone downloads just to look at the globe.
 */
export async function cutRingsInWorker(
  rings: Ring[],
  cutterPoints: [number, number, number][],
): Promise<{ pieces: Ring[][] } | null> {
  const [{ Vector3 }, { cutRings }] = await Promise.all([import("three"), import("../geo/cut")]);
  const points = cutterPoints.map(([x, y, z]) => new Vector3(x, y, z));
  return cutRings(rings, points);
}
