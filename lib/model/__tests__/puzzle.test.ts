import { readFileSync } from "node:fs";
import path from "node:path";
import { Quaternion } from "three";
import { describe, expect, it } from "vitest";
import type { Plate } from "../plate";
import { PUZZLE_ANCHOR_PLATE_IDS, PUZZLE_PIECE_PLATE_IDS, pieceErrorDeg, puzzleTargets } from "../puzzle";

const data = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "../../../public/data", f), "utf8"));

describe("puzzleTargets", () => {
  const rotations = data("rotations.json").rotations;
  const plates: Plate[] = data("plates.geo.json").plates.map((p: Plate) => ({
    ...p,
    rotations: rotations[String(p.plateId)] ?? [],
  }));
  const targets = puzzleTargets(plates);
  const byPid = (pid: number) => plates.find((p) => p.plateId === pid)!;

  it("leaves Africa where it is today", () => {
    expect(pieceErrorDeg(undefined, targets[byPid(701).id])).toBeLessThan(0.01);
  });

  it("asks every piece to actually move, and accepts its own target exactly", () => {
    for (const pid of [...PUZZLE_ANCHOR_PLATE_IDS, ...PUZZLE_PIECE_PLATE_IDS]) {
      expect(byPid(pid), `plate ${pid} in data`).toBeTruthy();
    }
    for (const pid of PUZZLE_PIECE_PLATE_IDS) {
      const target = targets[byPid(pid).id];
      expect(pieceErrorDeg(undefined, target)).toBeGreaterThan(15);
      expect(pieceErrorDeg(target, target)).toBeLessThan(0.01);
      expect(new Quaternion(...target).length()).toBeCloseTo(1, 6);
    }
  });
});
