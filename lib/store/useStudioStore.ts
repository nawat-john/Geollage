import { Vector3 } from "three";
import { create } from "zustand";
import { greatCircleCutter } from "../geo/greatCircle";
import { lonLatToVec3, vec3ToLonLat } from "../geo/spherical";
import type { Ring } from "../geo/triangulate";
import type { ProjectCamera, ProjectFileV1 } from "../io/projectFile";
import { serializeProject } from "../io/projectFile";
import { parseShareHash } from "../io/shareLink";
import { loadStudioData, type Attribution } from "../model/loadPlates";
import { IDENTITY_QUAT, orientationAtTime, pointOnPlate, type Plate, type Quat } from "../model/plate";
import {
  PUZZLE_ANCHOR_PLATE_IDS,
  PUZZLE_PIECE_PLATE_IDS,
  SNAP_DEG,
  pieceErrorDeg,
  puzzleTargets,
} from "../model/puzzle";
import { snapshotCamera } from "../three/cameraRegistry";
import { TOUR_STOPS } from "../data/tour";
import { cutRingsInWorker } from "../workers/geometryClient";

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type StudioMode = "reconstruction" | "sandbox";
export type SandboxTool = "select" | "drag" | "set-pole" | "cut-great-circle" | "cut-freehand";
export type DragRotateMode = "free" | "pole" | "twist";

/** A place the user pinned, carried along by whichever plate it sits on. */
export interface Pin {
  local: [number, number, number]; // present-day frame (same frame as plate.rings)
  plateId: string | null; // plate it was placed on; re-resolved by position if that plate is gone
  label: string;
}

export interface PuzzleState {
  targets: Record<string, Quat>; // target userTransform per puzzle plate id
  anchorIds: string[];
  showHint: boolean;
  saved: { plates: Plate[]; history: { past: Plate[][]; future: Plate[][] }; timeMa: number };
}

const MAX_HISTORY = 50;

interface StudioState {
  status: LoadStatus;
  error: string | null;
  plates: Plate[];
  /** Plates exactly as loaded — the puzzle always starts from these. */
  basePlates: Plate[];
  coastlines: Ring[];
  attribution: Attribution | null;

  timeMa: number;
  minTimeMa: number;
  maxTimeMa: number;
  isPlaying: boolean;
  playbackSpeedMaPerSec: number;

  hoveredPlateId: string | null;
  selectedPlateId: string | null;

  mode: StudioMode;
  sandboxTool: SandboxTool;
  dragRotateMode: DragRotateMode;
  eulerPole: [number, number, number] | null;

  draggingPlateId: string | null;
  cuttingPlateId: string | null;
  cutPreviewPoints: [number, number, number][];
  cutBusy: boolean;
  cutError: string | null;

  history: { past: Plate[][]; future: Plate[][] };

  loadData: () => Promise<void>;
  setTimeMa: (timeMa: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setPlaybackSpeed: (maPerSec: number) => void;
  hoverPlate: (id: string | null) => void;
  selectPlate: (id: string | null) => void;

  setMode: (mode: StudioMode) => void;
  setSandboxTool: (tool: SandboxTool) => void;
  setDragRotateMode: (mode: DragRotateMode) => void;
  setEulerPole: (point: [number, number, number] | null) => void;

  beginDrag: (plateId: string) => void;
  endDrag: () => void;
  commitPlateTransform: (plateId: string, quat: Quat) => void;
  resetPlateTransform: (plateId: string) => void;

  registerCutClick: (plateId: string, point: [number, number, number]) => Promise<void>;
  beginFreehandCut: (plateId: string, point: [number, number, number]) => void;
  addFreehandCutPoint: (point: [number, number, number]) => void;
  endFreehandCut: () => Promise<void>;
  cancelCut: () => void;

  undo: () => void;
  redo: () => void;
  setPlates: (plates: Plate[], opts?: { history?: boolean }) => void;

  pendingCamera: ProjectCamera | null;
  exportProject: () => ProjectFileV1;
  importProject: (project: ProjectFileV1) => void;
  consumePendingCamera: () => ProjectCamera | null;

  showLabels: boolean;
  toggleLabels: () => void;
  showMotion: boolean;
  toggleMotion: () => void;

  pin: Pin | null;
  pinPlacing: boolean;
  setPinPlacing: (placing: boolean) => void;
  placePinOnPlate: (plateId: string, world: [number, number, number]) => void;
  placePinAtLonLat: (lon: number, lat: number, label: string) => void;
  clearPin: () => void;
  /** Turn the camera to face the pin where it sits at the current time. */
  focusPin: () => void;

  puzzle: PuzzleState | null;
  startPuzzle: () => void;
  exitPuzzle: () => void;
  togglePuzzleHint: () => void;

  tourStopIndex: number | null;
  startTour: () => void;
  nextTourStop: () => void;
  prevTourStop: () => void;
  exitTour: () => void;
}

function pushHistory(past: Plate[][], plates: Plate[]): Plate[][] {
  const next = [...past, plates];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/** Plate a pin sits on, preferring the one it was placed on. */
export function resolvePinPlate(plates: Plate[], pin: Pin): Plate | undefined {
  const byId = pin.plateId ? plates.find((p) => p.id === pin.plateId) : undefined;
  if (byId) return byId;
  const v = new Vector3(...pin.local);
  return plates.find((p) => pointOnPlate(p, v));
}

export function formatLonLat(lon: number, lat: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
}

function newPlateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `plate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useStudioStore = create<StudioState>((set, get) => {
  /** Cut points are clicked/dragged in world space, but `cutRings` expects
   * them in the plate's own present-day reference frame (same frame as
   * plate.rings). Undo whatever orientation the plate currently renders
   * with — reconstruction SLERP plus any sandbox drag — to get there. */
  function worldPointToPlateLocal(plateId: string, world: [number, number, number]): [number, number, number] {
    const plate = get().plates.find((p) => p.id === plateId);
    if (!plate) return world;
    const orientation = orientationAtTime(plate, get().timeMa).invert();
    const local = new Vector3(...world).applyQuaternion(orientation);
    return [local.x, local.y, local.z];
  }

  /** Shared by both cut entry points: run the split in a worker, build new
   * Plate records, and commit them (with undo history) in one shot. */
  async function performCut(
    plateId: string,
    cutterPoints: [number, number, number][],
  ): Promise<void> {
    const plate = get().plates.find((p) => p.id === plateId);
    if (!plate) return;

    const result = await cutRingsInWorker(plate.rings, cutterPoints);
    if (!result || result.pieces.length < 2) {
      set({ cutError: "That cut didn't separate the plate — try again." });
      return;
    }

    const newPlates: Plate[] = result.pieces.map((rings, i) => ({
      id: newPlateId(),
      plateId: plate.plateId,
      name: `${plate.name} (${i + 1})`,
      rings,
      color: plate.color,
      rotations: plate.rotations,
      userTransform: plate.userTransform,
      derivedFrom: plate.id,
    }));

    const nextPlates = get().plates.flatMap((p) => (p.id === plateId ? newPlates : [p]));
    get().setPlates(nextPlates);
    set({ selectedPlateId: newPlates[0]?.id ?? null });
  }

  /** Apply a #hash share link (time, camera, pinned place) once data is in. */
  function applyShareLink() {
    if (typeof window === "undefined" || !window.location.hash) return;
    const shared = parseShareHash(window.location.hash);
    if (shared.timeMa !== undefined) get().setTimeMa(shared.timeMa);
    if (shared.camera) set({ pendingCamera: { position: shared.camera, target: [0, 0, 0], zoom: 1 } });
    if (shared.pin) {
      get().placePinAtLonLat(shared.pin.lon, shared.pin.lat, shared.pin.label);
      if (!shared.camera) get().focusPin();
    }
  }

  return {
    status: "idle",
    error: null,
    plates: [],
    basePlates: [],
    coastlines: [],
    attribution: null,

    timeMa: 0,
    minTimeMa: 0,
    maxTimeMa: 0,
    isPlaying: false,
    playbackSpeedMaPerSec: 20,

    hoveredPlateId: null,
    selectedPlateId: null,

    mode: "reconstruction",
    sandboxTool: "select",
    dragRotateMode: "free",
    eulerPole: null,

    draggingPlateId: null,
    cuttingPlateId: null,
    cutPreviewPoints: [],
    cutBusy: false,
    cutError: null,

    history: { past: [], future: [] },
    pendingCamera: null,

    showLabels: false,
    showMotion: false,
    pin: null,
    pinPlacing: false,
    puzzle: null,
    tourStopIndex: null,

    loadData: async () => {
      if (get().status === "loading" || get().status === "ready") return;
      set({ status: "loading", error: null });
      try {
        const { plates, coastlines, timespan, attribution } = await loadStudioData();
        set({
          status: "ready",
          plates,
          basePlates: plates,
          coastlines,
          attribution,
          minTimeMa: timespan.minMa,
          maxTimeMa: timespan.maxMa,
          timeMa: timespan.minMa,
        });
        applyShareLink();
      } catch (err) {
        set({ status: "error", error: (err as Error).message });
      }
    },

    setTimeMa: (timeMa) => {
      const { minTimeMa, maxTimeMa } = get();
      set({ timeMa: Math.max(minTimeMa, Math.min(maxTimeMa, timeMa)) });
    },
    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
    setPlaybackSpeed: (maPerSec) => set({ playbackSpeedMaPerSec: maPerSec }),

    hoverPlate: (id) => set({ hoveredPlateId: id }),
    selectPlate: (id) => set({ selectedPlateId: id }),

    setMode: (mode) => {
      get().exitPuzzle();
      set({
        mode,
        sandboxTool: "select",
        draggingPlateId: null,
        cuttingPlateId: null,
        cutPreviewPoints: [],
      });
    },
    setSandboxTool: (tool) =>
      set({ sandboxTool: tool, cuttingPlateId: null, cutPreviewPoints: [], cutError: null }),
    setDragRotateMode: (dragRotateMode) => set({ dragRotateMode }),
    setEulerPole: (point) => set({ eulerPole: point }),

    beginDrag: (plateId) => set({ draggingPlateId: plateId }),
    endDrag: () => set({ draggingPlateId: null }),

    commitPlateTransform: (plateId, quat) => {
      const { plates, history, puzzle } = get();
      // Puzzle pieces dropped close enough snap exactly onto their target.
      const target = puzzle?.targets[plateId];
      const snapped = target && pieceErrorDeg(quat, target) < SNAP_DEG ? target : quat;
      const nextPlates = plates.map((p) => (p.id === plateId ? { ...p, userTransform: snapped } : p));
      set({ plates: nextPlates, history: { past: pushHistory(history.past, plates), future: [] } });
    },

    resetPlateTransform: (plateId) => {
      get().commitPlateTransform(plateId, IDENTITY_QUAT);
    },

    registerCutClick: async (plateId, point) => {
      const { cuttingPlateId, cutPreviewPoints } = get();
      if (!cuttingPlateId) {
        set({ cuttingPlateId: plateId, cutPreviewPoints: [point] });
        return;
      }
      set({ cutBusy: true, cutError: null });
      const localA = worldPointToPlateLocal(cuttingPlateId, cutPreviewPoints[0]);
      const localB = worldPointToPlateLocal(cuttingPlateId, point);
      const arc = greatCircleCutter(new Vector3(...localA), new Vector3(...localB));
      await performCut(
        cuttingPlateId,
        arc.map((v): [number, number, number] => [v.x, v.y, v.z]),
      );
      set({ cuttingPlateId: null, cutPreviewPoints: [], cutBusy: false });
    },

    beginFreehandCut: (plateId, point) => {
      set({ cuttingPlateId: plateId, cutPreviewPoints: [point] });
    },
    addFreehandCutPoint: (point) => {
      set((s) => ({ cutPreviewPoints: [...s.cutPreviewPoints, point] }));
    },
    endFreehandCut: async () => {
      const { cuttingPlateId, cutPreviewPoints } = get();
      if (!cuttingPlateId || cutPreviewPoints.length < 2) {
        set({ cuttingPlateId: null, cutPreviewPoints: [] });
        return;
      }
      set({ cutBusy: true, cutError: null });
      const localPoints = cutPreviewPoints.map((p) => worldPointToPlateLocal(cuttingPlateId, p));
      await performCut(cuttingPlateId, localPoints);
      set({ cuttingPlateId: null, cutPreviewPoints: [], cutBusy: false });
    },

    cancelCut: () => set({ cuttingPlateId: null, cutPreviewPoints: [], cutError: null }),

    undo: () => {
      const { history, plates } = get();
      if (history.past.length === 0) return;
      const previous = history.past[history.past.length - 1];
      set({
        plates: previous,
        history: {
          past: history.past.slice(0, -1),
          future: [plates, ...history.future].slice(0, MAX_HISTORY),
        },
      });
    },
    redo: () => {
      const { history, plates } = get();
      if (history.future.length === 0) return;
      const next = history.future[0];
      set({
        plates: next,
        history: {
          past: pushHistory(history.past, plates),
          future: history.future.slice(1),
        },
      });
    },

    setPlates: (plates, opts) => {
      if (opts?.history === false) {
        set({ plates });
        return;
      }
      const { plates: prev, history } = get();
      set({ plates, history: { past: pushHistory(history.past, prev), future: [] } });
    },

    exportProject: () => {
      const state = get();
      return serializeProject({
        mode: state.mode,
        camera: snapshotCamera(),
        timeMa: state.timeMa,
        minTimeMa: state.minTimeMa,
        maxTimeMa: state.maxTimeMa,
        modelName: state.attribution?.model ?? "unknown",
        attribution: state.attribution?.citation ?? "",
        plates: state.plates,
      });
    },

    importProject: (project) => {
      get().exitPuzzle();
      set({
        mode: project.mode,
        plates: project.plates,
        timeMa: project.timeline.timeMa,
        minTimeMa: project.timeline.min,
        maxTimeMa: project.timeline.max,
        pendingCamera: project.camera,
        history: { past: [], future: [] },
        selectedPlateId: null,
        hoveredPlateId: null,
        sandboxTool: "select",
      });
    },

    consumePendingCamera: () => {
      const { pendingCamera } = get();
      if (pendingCamera) set({ pendingCamera: null });
      return pendingCamera;
    },

    toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
    toggleMotion: () => set((s) => ({ showMotion: !s.showMotion })),

    setPinPlacing: (pinPlacing) => set({ pinPlacing }),
    placePinOnPlate: (plateId, world) => {
      const local = new Vector3(...worldPointToPlateLocal(plateId, world)).normalize();
      const [lon, lat] = vec3ToLonLat(local);
      set({
        pin: { local: [local.x, local.y, local.z], plateId, label: formatLonLat(lon, lat) },
        pinPlacing: false,
      });
    },
    placePinAtLonLat: (lon, lat, label) => {
      const local = lonLatToVec3(lon, lat, 1);
      set({
        pin: { local: [local.x, local.y, local.z], plateId: null, label: label || formatLonLat(lon, lat) },
        pinPlacing: false,
      });
    },
    clearPin: () => set({ pin: null, pinPlacing: false }),
    focusPin: () => {
      const { pin, plates, timeMa } = get();
      const plate = pin ? resolvePinPlate(plates, pin) : undefined;
      if (!pin || !plate) return;
      const world = new Vector3(...pin.local).applyQuaternion(orientationAtTime(plate, timeMa));
      const camera = snapshotCamera();
      const distance = Math.hypot(...camera.position) || 2.8;
      world.multiplyScalar(distance);
      set({ pendingCamera: { position: [world.x, world.y, world.z], target: [0, 0, 0], zoom: camera.zoom } });
    },

    startPuzzle: () => {
      const { basePlates, plates, history, timeMa, puzzle } = get();
      if (puzzle) return;
      const pick = (ids: number[]) =>
        basePlates.filter((p) => p.plateId !== undefined && ids.includes(p.plateId));
      const anchors = pick(PUZZLE_ANCHOR_PLATE_IDS);
      const pieces = [...anchors, ...pick(PUZZLE_PIECE_PLATE_IDS)].map((p) => ({
        ...p,
        userTransform: undefined,
      }));
      set({
        mode: "sandbox",
        sandboxTool: "drag",
        dragRotateMode: "free",
        isPlaying: false,
        tourStopIndex: null,
        timeMa: 0,
        plates: pieces,
        history: { past: [], future: [] },
        selectedPlateId: null,
        hoveredPlateId: null,
        cuttingPlateId: null,
        cutPreviewPoints: [],
        pinPlacing: false,
        puzzle: {
          targets: puzzleTargets(pieces),
          anchorIds: anchors.map((p) => p.id),
          showHint: false,
          saved: { plates, history, timeMa },
        },
      });
    },
    exitPuzzle: () => {
      const { puzzle } = get();
      if (!puzzle) return;
      set({
        puzzle: null,
        plates: puzzle.saved.plates,
        history: puzzle.saved.history,
        timeMa: puzzle.saved.timeMa,
        selectedPlateId: null,
        hoveredPlateId: null,
        draggingPlateId: null,
      });
    },
    togglePuzzleHint: () =>
      set((s) => (s.puzzle ? { puzzle: { ...s.puzzle, showHint: !s.puzzle.showHint } } : {})),

    startTour: () => {
      set({
        mode: "reconstruction",
        isPlaying: false,
        tourStopIndex: 0,
        timeMa: TOUR_STOPS[0].timeMa,
      });
    },
    nextTourStop: () => {
      const { tourStopIndex } = get();
      if (tourStopIndex === null) return;
      const next = tourStopIndex + 1;
      if (next >= TOUR_STOPS.length) {
        set({ tourStopIndex: null });
        return;
      }
      set({ tourStopIndex: next, timeMa: TOUR_STOPS[next].timeMa, isPlaying: false });
    },
    prevTourStop: () => {
      const { tourStopIndex } = get();
      if (tourStopIndex === null || tourStopIndex === 0) return;
      const prev = tourStopIndex - 1;
      set({ tourStopIndex: prev, timeMa: TOUR_STOPS[prev].timeMa, isPlaying: false });
    },
    exitTour: () => set({ tourStopIndex: null }),
  };
});
