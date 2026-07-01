import { Quaternion } from "three";
import { describe, expect, it } from "vitest";
import { instantaneousMotion, orientationAtTime, type Plate } from "../plate";

function makePlate(rotations: Plate["rotations"], userTransform?: Plate["userTransform"]): Plate {
  return {
    id: "p1",
    name: "Test Plate",
    color: "hsl(0,0%,0%)",
    rings: [[[0, 0]]],
    rotations,
    userTransform,
  };
}

describe("orientationAtTime", () => {
  it("returns identity for a plate with no rotation history and no user transform", () => {
    const plate = makePlate([]);
    const q = orientationAtTime(plate, 42);
    expect(q.equals(new Quaternion())).toBe(true);
  });

  it("composes userTransform on top of the base reconstruction rotation", () => {
    const base = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const plate = makePlate([{ timeMa: 0, quat: base.toArray() as Plate["rotations"][0]["quat"] }], [0, 0, 0, 1]);
    const q = orientationAtTime(plate, 0);
    expect(q.equals(base)).toBe(true);
  });
});

describe("instantaneousMotion", () => {
  it("returns null with fewer than two keyframes", () => {
    expect(instantaneousMotion(makePlate([{ timeMa: 0, quat: [0, 0, 0, 1] }]), 0)).toBeNull();
  });

  it("recovers the axis and rate of a plate rotating steadily about Y", () => {
    // 90 degrees about Y spread evenly over 10 Myr.
    const q10 = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const plate = makePlate([
      { timeMa: 0, quat: [0, 0, 0, 1] },
      { timeMa: 10, quat: q10.toArray() as Plate["rotations"][0]["quat"] },
    ]);
    const motion = instantaneousMotion(plate, 5);
    expect(motion).not.toBeNull();
    expect(motion!.poleLat).toBeCloseTo(90, 0); // Y axis -> north pole in lon/lat terms
    expect(motion!.degPerMyr).toBeCloseTo(9, 0); // 90 degrees / 10 Myr
  });
});
