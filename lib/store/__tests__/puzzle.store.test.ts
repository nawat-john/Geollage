import { readFileSync } from "node:fs";
import path from "node:path";
import { Quaternion, Vector3 } from "three";
import { beforeEach, describe, expect, it } from "vitest";
import type { Plate, Quat } from "../../model/plate";
import { PUZZLE_PIECE_PLATE_IDS, isPiecePlaced } from "../../model/puzzle";
import { useStudioStore } from "../useStudioStore";

const data = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "../../../public/data", f), "utf8"));

function nudge(q: Quat, deg: number): Quat {
  const off = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
  return off.multiply(new Quaternion(...q)).toArray() as Quat;
}

describe("puzzle flow in the store", () => {
  const rotations = data("rotations.json").rotations;
  const plates: Plate[] = data("plates.geo.json").plates.map((p: Plate) => ({
    ...p,
    rotations: rotations[String(p.plateId)] ?? [],
  }));

  beforeEach(() => {
    useStudioStore.setState({ status: "ready", plates, basePlates: plates, timeMa: 120, puzzle: null });
  });

  it("snaps a piece dropped near its target, unsnaps on undo, and restores work on exit", () => {
    const s = useStudioStore.getState();
    s.startPuzzle();
    const { puzzle, plates: pieces, timeMa } = useStudioStore.getState();
    expect(puzzle).not.toBeNull();
    expect(timeMa).toBe(0);
    expect(pieces).toHaveLength(9);

    const sam = pieces.find((p) => p.plateId === PUZZLE_PIECE_PLATE_IDS[0])!;
    const target = puzzle!.targets[sam.id];

    // Too far: stays where dropped.
    s.commitPlateTransform(sam.id, nudge(target, 20));
    let placed = useStudioStore.getState().plates.find((p) => p.id === sam.id)!;
    expect(isPiecePlaced(placed.userTransform, target)).toBe(false);

    // Close: snaps exactly.
    s.commitPlateTransform(sam.id, nudge(target, 5));
    placed = useStudioStore.getState().plates.find((p) => p.id === sam.id)!;
    expect(isPiecePlaced(placed.userTransform, target)).toBe(true);

    s.undo();
    placed = useStudioStore.getState().plates.find((p) => p.id === sam.id)!;
    expect(isPiecePlaced(placed.userTransform, target)).toBe(false);

    s.exitPuzzle();
    expect(useStudioStore.getState().puzzle).toBeNull();
    expect(useStudioStore.getState().plates).toBe(plates);
    expect(useStudioStore.getState().timeMa).toBe(120);
  });
});
