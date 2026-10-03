import { describe, expect, it } from "vitest";
import { encodeShareHash, parseShareHash } from "../shareLink";

describe("share link hash", () => {
  it("round-trips time, camera and pin", () => {
    const hash = encodeShareHash({
      timeMa: 249.6,
      camera: [0.12345, -1.5, 2.2],
      pin: { lon: 100.5018, lat: 13.7563, label: "Bangkok & co" },
    });
    expect(parseShareHash(hash)).toEqual({
      timeMa: 250,
      camera: [0.123, -1.5, 2.2],
      pin: { lon: 100.502, lat: 13.756, label: "Bangkok & co" },
    });
  });

  it("drops malformed or out-of-range values instead of throwing", () => {
    expect(parseShareHash("#t=abc&cam=1,2&pin=10,95")).toEqual({});
    expect(parseShareHash("#cam=0,0,0.5")).toEqual({});
    expect(parseShareHash("")).toEqual({});
  });
});
