"use client";

import { useStudioStore, type SandboxTool } from "@/lib/store/useStudioStore";

const TOOL_LABEL: Record<SandboxTool, string> = {
  select: "Select",
  drag: "Drag",
  "set-pole": "Click globe to set pole…",
  "cut-great-circle": "Cut (great circle)",
  "cut-freehand": "Cut (freehand)",
};

function PlateJumpSelect() {
  const plates = useStudioStore((s) => s.plates);
  const selectedPlateId = useStudioStore((s) => s.selectedPlateId);
  const selectPlate = useStudioStore((s) => s.selectPlate);

  return (
    <select
      aria-label="Jump to plate"
      value={selectedPlateId ?? ""}
      onChange={(e) => selectPlate(e.target.value || null)}
      className="rounded bg-white/10 px-2 py-1 text-xs text-white"
    >
      <option value="">Jump to plate…</option>
      {plates.map((p) => (
        <option key={p.id} value={p.id} className="text-black">
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function Toolbar() {
  const status = useStudioStore((s) => s.status);
  const mode = useStudioStore((s) => s.mode);
  const setMode = useStudioStore((s) => s.setMode);
  const sandboxTool = useStudioStore((s) => s.sandboxTool);
  const setSandboxTool = useStudioStore((s) => s.setSandboxTool);
  const dragRotateMode = useStudioStore((s) => s.dragRotateMode);
  const setDragRotateMode = useStudioStore((s) => s.setDragRotateMode);
  const eulerPole = useStudioStore((s) => s.eulerPole);
  const canUndo = useStudioStore((s) => s.history.past.length > 0);
  const canRedo = useStudioStore((s) => s.history.future.length > 0);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);
  const cutBusy = useStudioStore((s) => s.cutBusy);
  const cutError = useStudioStore((s) => s.cutError);
  const showLabels = useStudioStore((s) => s.showLabels);
  const toggleLabels = useStudioStore((s) => s.toggleLabels);
  const tourStopIndex = useStudioStore((s) => s.tourStopIndex);
  const startTour = useStudioStore((s) => s.startTour);

  if (status !== "ready") return null;

  const toolButtonClass = (tool: SandboxTool) =>
    `rounded px-2 py-1 text-xs ${
      sandboxTool === tool ? "bg-amber-400 text-black" : "bg-white/10 text-white hover:bg-white/20"
    }`;

  return (
    <div
      role="toolbar"
      aria-label="Studio controls"
      className="pointer-events-auto absolute top-4 left-4 flex flex-col gap-2 text-white"
    >
      <div className="flex gap-1 rounded-lg bg-black/70 p-1 backdrop-blur-sm">
        <button
          aria-pressed={mode === "reconstruction"}
          onClick={() => setMode("reconstruction")}
          className={`rounded px-3 py-1 text-xs font-medium ${
            mode === "reconstruction" ? "bg-amber-400 text-black" : "hover:bg-white/10"
          }`}
        >
          Time Machine
        </button>
        <button
          aria-pressed={mode === "sandbox"}
          onClick={() => setMode("sandbox")}
          className={`rounded px-3 py-1 text-xs font-medium ${
            mode === "sandbox" ? "bg-amber-400 text-black" : "hover:bg-white/10"
          }`}
        >
          Sandbox
        </button>
      </div>

      <div className="rounded-lg bg-black/70 p-1 backdrop-blur-sm">
        <PlateJumpSelect />
      </div>

      {mode === "reconstruction" && (
        <div className="flex items-center gap-2 rounded-lg bg-black/70 p-2 backdrop-blur-sm">
          <button
            onClick={startTour}
            disabled={tourStopIndex !== null}
            className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
          >
            Take the tour
          </button>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
            Show labels
          </label>
        </div>
      )}

      {mode === "sandbox" && (
        <div className="flex flex-col gap-2 rounded-lg bg-black/70 p-2 backdrop-blur-sm">
          <div className="flex flex-wrap gap-1">
            <button
              aria-pressed={sandboxTool === "select"}
              className={toolButtonClass("select")}
              onClick={() => setSandboxTool("select")}
            >
              {TOOL_LABEL.select}
            </button>
            <button
              aria-pressed={sandboxTool === "drag"}
              className={toolButtonClass("drag")}
              onClick={() => setSandboxTool("drag")}
            >
              {TOOL_LABEL.drag}
            </button>
            <button
              aria-pressed={sandboxTool === "cut-great-circle"}
              className={toolButtonClass("cut-great-circle")}
              onClick={() => setSandboxTool("cut-great-circle")}
            >
              {TOOL_LABEL["cut-great-circle"]}
            </button>
            <button
              aria-pressed={sandboxTool === "cut-freehand"}
              className={toolButtonClass("cut-freehand")}
              onClick={() => setSandboxTool("cut-freehand")}
            >
              {TOOL_LABEL["cut-freehand"]}
            </button>
          </div>

          {sandboxTool === "drag" && (
            <div className="flex items-center gap-2 border-t border-white/10 pt-2 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={dragRotateMode === "free"}
                  onChange={() => setDragRotateMode("free")}
                />
                Free rotate
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={dragRotateMode === "pole"}
                  onChange={() => setDragRotateMode("pole")}
                />
                Fixed pole
              </label>
              {dragRotateMode === "pole" && (
                <button
                  className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
                  onClick={() => setSandboxTool("set-pole")}
                >
                  {eulerPole ? "Change pole" : "Set pole"}
                </button>
              )}
            </div>
          )}

          {sandboxTool === "set-pole" && (
            <p className="text-xs text-amber-300">Click anywhere on the globe to place the pole.</p>
          )}
          {(sandboxTool === "cut-great-circle" || sandboxTool === "cut-freehand") && (
            <p className="text-xs text-white/70">
              {sandboxTool === "cut-great-circle"
                ? "Click two points on a plate to slice it along the great circle through them."
                : "Drag a stroke across a plate to slice along that line."}
            </p>
          )}
          {cutBusy && (
            <p role="status" className="text-xs text-amber-300">
              Cutting…
            </p>
          )}
          {cutError && (
            <p role="alert" className="text-xs text-red-400">
              {cutError}
            </p>
          )}

          <div className="flex gap-1 border-t border-white/10 pt-2">
            <button
              disabled={!canUndo}
              onClick={undo}
              className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
            >
              Undo
            </button>
            <button
              disabled={!canRedo}
              onClick={redo}
              className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
            >
              Redo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
