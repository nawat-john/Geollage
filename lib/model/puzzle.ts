import { Quaternion } from "three";
import { quatAngleDeg } from "../geo/spherical";
import { baseOrientationAtTime, type Plate, type Quat } from "./plate";

/** Pangaea at its most assembled, in this model's timeline. */
export const PUZZLE_TIME_MA = 250;
/** Africa and the plates riding with it stay put; everything else is moved onto them. */
export const PUZZLE_ANCHOR_PLATE_IDS = [701, 709, 503]; // Africa, Somalia, Arabia
export const PUZZLE_PIECE_PLATE_IDS = [201, 101, 301, 501, 801, 802]; // S. America, N. America, Eurasia, India, Australia, Antarctica
const AFRICA = 701;
/** Close enough to count as placed — the piece then snaps exactly into position. */
export const SNAP_DEG = 9;

/**
 * Target sandbox `userTransform` for each puzzle plate: where it sat at
 * PUZZLE_TIME_MA, expressed relative to Africa held at its present-day
 * position (so the player builds around a familiar fixed continent).
 * Plate render orientation is userTransform · base(t); with t = 0 the target
 * userTransform is A(0)·A(T)⁻¹·P(T)·P(0)⁻¹.
 */
export function puzzleTargets(plates: Plate[]): Record<string, Quat> {
  const africa = plates.find((p) => p.plateId === AFRICA);
  if (!africa) return {};
  const frame = baseOrientationAtTime(africa, 0).multiply(
    baseOrientationAtTime(africa, PUZZLE_TIME_MA).invert(),
  );
  const targets: Record<string, Quat> = {};
  for (const plate of plates) {
    const pose = frame.clone().multiply(baseOrientationAtTime(plate, PUZZLE_TIME_MA));
    const user = pose.multiply(baseOrientationAtTime(plate, 0).invert());
    targets[plate.id] = user.toArray() as Quat;
  }
  return targets;
}

/** A piece counts as placed once it has snapped onto its target. */
export function isPiecePlaced(userTransform: Quat | undefined, target: Quat | undefined): boolean {
  return !!target && pieceErrorDeg(userTransform, target) < 0.01;
}

/** Degrees between where the piece is and where it belongs. */
export function pieceErrorDeg(userTransform: Quat | undefined, target: Quat): number {
  return quatAngleDeg(new Quaternion(...(userTransform ?? [0, 0, 0, 1])), new Quaternion(...target));
}
