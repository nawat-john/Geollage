import { describe, expect, it } from "vitest";
import type { Plate } from "../../model/plate";
import {
  CURRENT_SCHEMA_VERSION,
  deserializeProject,
  PROJECT_FORMAT,
  serializeProject,
} from "../projectFile";

const platesFixture: Plate[] = [
  {
    id: "plate-701",
    plateId: 701,
    name: "Africa",
    color: "hsl(10, 62%, 55%)",
    rings: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
    rotations: [
      { timeMa: 0, quat: [0, 0, 0, 1] },
      { timeMa: 10, quat: [0.1, 0, 0, 0.995] },
    ],
  },
  {
    id: "plate-701-a",
    plateId: 701,
    name: "Africa (1)",
    color: "hsl(10, 62%, 55%)",
    rings: [
      [
        [0, 0],
        [5, 0],
        [5, 10],
        [0, 10],
        [0, 0],
      ],
    ],
    rotations: [{ timeMa: 0, quat: [0, 0, 0, 1] }],
    userTransform: [0.02, 0.03, 0.01, 0.999],
    derivedFrom: "plate-701",
  },
];

function buildProject() {
  return serializeProject({
    mode: "sandbox",
    camera: { position: [0, 0, 2.8], target: [0, 0, 0], zoom: 1 },
    timeMa: 0,
    minTimeMa: 0,
    maxTimeMa: 1800,
    modelName: "MERDITH2021",
    attribution: "Merdith et al. 2021",
    plates: platesFixture,
  });
}

describe("projectFile round-trip", () => {
  it("export -> import reproduces the same plates and metadata", () => {
    const exported = buildProject();
    const json = JSON.parse(JSON.stringify(exported)); // simulate the Blob/JSON.stringify hop

    const result = deserializeProject(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.project.format).toBe(PROJECT_FORMAT);
    expect(result.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.project.mode).toBe("sandbox");
    expect(result.project.timeline).toEqual({ timeMa: 0, min: 0, max: 1800 });
    expect(result.project.plates).toEqual(platesFixture);
  });

  it("rejects a file with the wrong format tag", () => {
    const result = deserializeProject({ format: "something-else", schemaVersion: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a file from a newer, unrecognized schema version", () => {
    const project = buildProject();
    const result = deserializeProject({ ...project, schemaVersion: 999 });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(deserializeProject(null).ok).toBe(false);
    expect(deserializeProject("just a string").ok).toBe(false);
    expect(deserializeProject(42).ok).toBe(false);
  });

  it("rejects a project missing its plates array", () => {
    const project = buildProject() as unknown as Record<string, unknown>;
    delete project.plates;
    expect(deserializeProject(project).ok).toBe(false);
  });
});
