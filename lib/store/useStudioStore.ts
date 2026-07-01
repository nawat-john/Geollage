import { Vector3 } from "three";
import { create } from "zustand";
import { greatCircleCutter } from "../geo/greatCircle";
import type { ProjectCamera, ProjectFileV1 } from "../io/projectFile";
import { serializeProject } from "../io/projectFile";
import { loadStudioData, type Attribution } from "../model/loadPlates";
import { IDENTITY_QUAT, orientationAtTime, type Plate, type Quat } from "../model/plate";
import { snapshotCamera } from "../three/cameraRegistry";
import { TOUR_STOPS } from "../data/tour";
import { cutRingsInWorker } from "../workers/geometryClient";

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type StudioMode = "reconstruction" | "sandbox";
export type SandboxTool = "select" | "drag" | "set-pole" | "cut-great-circle" | "cut-freehand";
export type DragRotateMode = "free" | "pole";

const MAX_HISTORY = 50;

interface StudioState {
  status: LoadStatus;
  error: string | null;
  plates: Plate[];
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

  return {
    status: "idle",
    error: null,
    plates: [],
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
    tourStopIndex: null,

    loadData: async () => {
      if (get().status === "loading" || get().status === "ready") return;
      set({ status: "loading", error: null });
      try {
        const { plates, timespan, attribution } = await loadStudioData();
        set({
          status: "ready",
          plates,
          attribution,
          minTimeMa: timespan.minMa,
          maxTimeMa: timespan.maxMa,
          timeMa: timespan.minMa,
        });
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

    setMode: (mode) =>
      set({
        mode,
        sandboxTool: "select",
        draggingPlateId: null,
        cuttingPlateId: null,
        cutPreviewPoints: [],
      }),
    setSandboxTool: (tool) =>
      set({ sandboxTool: tool, cuttingPlateId: null, cutPreviewPoints: [], cutError: null }),
    setDragRotateMode: (dragRotateMode) => set({ dragRotateMode }),
    setEulerPole: (point) => set({ eulerPole: point }),

    beginDrag: (plateId) => set({ draggingPlateId: plateId }),
    endDrag: () => set({ draggingPlateId: null }),

    commitPlateTransform: (plateId, quat) => {
      const { plates, history } = get();
      const nextPlates = plates.map((p) => (p.id === plateId ? { ...p, userTransform: quat } : p));
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
