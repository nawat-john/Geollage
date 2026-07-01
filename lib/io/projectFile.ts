import type { StudioMode } from "../store/useStudioStore";
import type { Plate } from "../model/plate";

export const PROJECT_FORMAT = "tecto-studio";
export const CURRENT_SCHEMA_VERSION = 1;
export const APP_VERSION = "0.1.0";
export const PROJECT_FILE_EXTENSION = ".tecto.json";

export interface ProjectCamera {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

export interface ProjectFileV1 {
  format: typeof PROJECT_FORMAT;
  schemaVersion: 1;
  createdAt: string;
  app: { version: string };
  mode: StudioMode;
  camera: ProjectCamera;
  timeline: { timeMa: number; min: number; max: number };
  model: { name: string; attribution: string };
  plates: Plate[];
  annotations: unknown[];
}

export type ProjectFile = ProjectFileV1;

export interface SerializeInput {
  mode: StudioMode;
  camera: ProjectCamera;
  timeMa: number;
  minTimeMa: number;
  maxTimeMa: number;
  modelName: string;
  attribution: string;
  plates: Plate[];
}

export function serializeProject(input: SerializeInput): ProjectFileV1 {
  return {
    format: PROJECT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    app: { version: APP_VERSION },
    mode: input.mode,
    camera: input.camera,
    timeline: { timeMa: input.timeMa, min: input.minTimeMa, max: input.maxTimeMa },
    model: { name: input.modelName, attribution: input.attribution },
    plates: input.plates,
    annotations: [],
  };
}

export type DeserializeResult =
  | { ok: true; project: ProjectFileV1 }
  | { ok: false; error: string };

/**
 * Parses + validates a project file, running schema migrations if it's from
 * an older (but recognized) version. There is only one schema version so
 * far; this is the seam future migrations plug into.
 */
export function deserializeProject(raw: unknown): DeserializeResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Not a valid project file (expected a JSON object)." };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== PROJECT_FORMAT) {
    return { ok: false, error: `Not a ${PROJECT_FORMAT} project file.` };
  }
  if (typeof obj.schemaVersion !== "number") {
    return { ok: false, error: "Missing schemaVersion." };
  }
  if (obj.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This file was saved by a newer version of the app (schema ${obj.schemaVersion}); please update the app to open it.`,
    };
  }

  const migrated = migrate(obj);
  if (!migrated.ok) return migrated;

  const validation = validateV1(migrated.project);
  if (!validation.ok) return validation;

  return { ok: true, project: migrated.project };
}

function migrate(obj: Record<string, unknown>): DeserializeResult {
  // schemaVersion 1 is the only version so far — nothing to migrate yet.
  // Future versions: `if (obj.schemaVersion === 1) obj = migrateV1ToV2(obj);`
  return { ok: true, project: obj as unknown as ProjectFileV1 };
}

function validateV1(project: ProjectFileV1): DeserializeResult {
  if (!Array.isArray(project.plates)) {
    return { ok: false, error: "Project file is missing its plates array." };
  }
  if (project.mode !== "reconstruction" && project.mode !== "sandbox") {
    return { ok: false, error: "Project file has an invalid mode." };
  }
  if (!project.timeline || typeof project.timeline.timeMa !== "number") {
    return { ok: false, error: "Project file is missing timeline data." };
  }
  return { ok: true, project };
}

/** Triggers a browser download of the project as a `.tecto.json` file. */
export function downloadProjectFile(project: ProjectFileV1, filename = "project"): void {
  const json = JSON.stringify(project);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(PROJECT_FILE_EXTENSION)
    ? filename
    : `${filename}${PROJECT_FILE_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The browser reads the blob URL asynchronously to start the download;
  // revoking it in the same tick (e.g. in a `finally` right after `click()`)
  // can race that and cancel the download. Deferring avoids the race while
  // still releasing the URL promptly.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File | Blob): Promise<DeserializeResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Could not read the file." };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  return deserializeProject(json);
}
