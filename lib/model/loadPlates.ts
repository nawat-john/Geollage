import type { FiniteRotation, Plate } from "./plate";
import type { Ring } from "../geo/triangulate";

interface PlatesGeoJson {
  format: "tecto-studio-plates";
  schemaVersion: number;
  model: string;
  plates: {
    id: string;
    plateId: number;
    name: string;
    rings: Ring[];
    color: string;
  }[];
}

interface RotationsJson {
  format: "tecto-studio-rotations";
  schemaVersion: number;
  model: string;
  timespan: { minMa: number; maxMa: number };
  stepMa: number;
  rotations: Record<string, FiniteRotation[]>;
}

export interface Attribution {
  model: string;
  title: string;
  citation: string;
  dataService: string;
  license: string;
  fetchedAt: string;
}

export interface LoadedStudioData {
  plates: Plate[];
  timespan: { minMa: number; maxMa: number };
  attribution: Attribution;
}

// Next's basePath (set for GitHub Pages project subpaths) only rewrites the
// framework's own asset/routing system — plain runtime fetch() calls to
// hardcoded absolute paths need the prefix applied manually.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE_PATH}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadStudioData(): Promise<LoadedStudioData> {
  const [platesGeo, rotations, attribution] = await Promise.all([
    fetchJson<PlatesGeoJson>("/data/plates.geo.json"),
    fetchJson<RotationsJson>("/data/rotations.json"),
    fetchJson<Attribution>("/data/attribution.json"),
  ]);

  const plates: Plate[] = platesGeo.plates.map((p) => ({
    id: p.id,
    plateId: p.plateId,
    name: p.name,
    rings: p.rings,
    color: p.color,
    rotations: rotations.rotations[String(p.plateId)] ?? [],
  }));

  return { plates, timespan: rotations.timespan, attribution };
}
