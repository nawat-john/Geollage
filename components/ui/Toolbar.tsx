"use client";

import { useStudioStore, type SandboxTool } from "@/lib/store/useStudioStore";
import { useState } from "react";
import { PinPanel } from "./PinPanel";
import { PuzzlePanel } from "./PuzzlePanel";

const TOOL_LABEL: Record<SandboxTool, string> = {
  select: "Select",
  drag: "Drag",
  "set-pole": "Click globe to set pole…",
  "cut-great-circle": "Cut (great circle)",
  "cut-freehand": "Cut (freehand)",
};

const CARD = "rounded-xl bg-black/65 shadow-xl ring-1 ring-white/10 backdrop-blur-md";
const SOFT_BUTTON = "rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30";

function PlateJumpSelect() {
  const plates = useStudioStore((s) => s.plates);
  const selectedPlateId = useStudioStore((s) => s.selectedPlateId);
  const selectPlate = useStudioStore((s) => s.selectPlate);

  return (
    <select
      aria-label="Jump to plate"
      value={selectedPlateId ?? ""}
      onChange={(e) => selectPlate(e.target.value || null)}
      className="w-full rounded-md bg-white/10 px-2 py-1 text-xs text-white"
    >
      <option value="">Jump to plate…</option>
      {[...plates]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => (
          <option key={p.id} value={p.id} className="text-black">
            {p.name}
          </option>
        ))}
    </select>
  );
}

function PuzzleButton() {
  const startPuzzle = useStudioStore((s) => s.startPuzzle);
  return (
    <button
      onClick={startPuzzle}
      className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-1.5 text-xs font-semibold text-white shadow hover:from-emerald-400 hover:to-teal-400"
    >
      Pangaea puzzle
    </button>
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
  const showMotion = useStudioStore((s) => s.showMotion);
  const toggleMotion = useStudioStore((s) => s.toggleMotion);
  const tourStopIndex = useStudioStore((s) => s.tourStopIndex);
  const startTour = useStudioStore((s) => s.startTour);
  const inPuzzle = useStudioStore((s) => s.puzzle !== null);
  // On phones the panels would cover the globe; they fold behind a toggle.
  const [panelsOpen, setPanelsOpen] = useState(false);

  if (status !== "ready") return null;

  const toolButtonClass = (tool: SandboxTool) =>
    `rounded-md px-2 py-1 text-xs ${
      sandboxTool === tool ? "bg-amber-400 text-black" : "bg-white/10 text-white hover:bg-white/20"
    }`;
  const modeButtonClass = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      on ? "bg-amber-400 text-black shadow" : "text-white/80 hover:bg-white/10"
    }`;

  return (
    <div
      role="toolbar"
      aria-label="Studio controls"
      className="pointer-events-auto absolute top-14 left-3 flex max-h-[calc(100dvh-13rem)] w-64 flex-col gap-2 overflow-y-auto text-white sm:top-4 sm:left-4 sm:max-h-[calc(100dvh-10rem)]"
    >
      <div className={`flex gap-1 p-1 ${CARD}`}>
        <button
          aria-pressed={mode === "reconstruction"}
          onClick={() => setMode("reconstruction")}
          className={modeButtonClass(mode === "reconstruction")}
        >
          Time Machine
        </button>
        <button
          aria-pressed={mode === "sandbox"}
          onClick={() => setMode("sandbox")}
          className={modeButtonClass(mode === "sandbox")}
        >
          Sandbox
        </button>
      </div>

      <button
        onClick={() => setPanelsOpen((o) => !o)}
        aria-expanded={panelsOpen}
        className={`self-start px-3 py-1.5 text-xs font-medium sm:hidden ${CARD}`}
      >
        {panelsOpen ? "Hide controls ▴" : "Show controls ▾"}
      </button>

      <div className={`${panelsOpen ? "flex" : "hidden"} flex-col gap-2 sm:flex`}>
        {inPuzzle ? (
          <PuzzlePanel />
        ) : (
          <>
            <div className={`p-1 ${CARD}`}>
              <PlateJumpSelect />
            </div>

            {mode === "reconstruction" && (
              <>
                <div className={`flex flex-col gap-2 p-3 ${CARD}`}>
                  <div className="flex gap-1">
                    <button
                      onClick={startTour}
                      disabled={tourStopIndex !== null}
                      className={`flex-1 py-1.5 ${SOFT_BUTTON}`}
                    >
                      Take the tour
                    </button>
                  </div>
                  <PuzzleButton />
                  <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={showLabels} onChange={toggleLabels} className="accent-amber-400" />
                      Show labels
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={showMotion} onChange={toggleMotion} className="accent-amber-400" />
                      Motion arrows
                      <span className="text-white/40">(speed &amp; heading)</span>
                    </label>
                  </div>
                </div>
                <PinPanel />
              </>
            )}

            {mode === "sandbox" && (
              <div className={`flex flex-col gap-2 p-3 ${CARD}`}>
                <div className="flex flex-wrap gap-1">
                  {(["select", "drag", "cut-great-circle", "cut-freehand"] as const).map((tool) => (
                    <button
                      key={tool}
                      aria-pressed={sandboxTool === tool}
                      className={toolButtonClass(tool)}
                      onClick={() => setSandboxTool(tool)}
                    >
                      {TOOL_LABEL[tool]}
                    </button>
                  ))}
                </div>

                {sandboxTool === "drag" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 text-xs">
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
                        checked={dragRotateMode === "twist"}
                        onChange={() => setDragRotateMode("twist")}
                      />
                      Twist
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
                      <button className={SOFT_BUTTON} onClick={() => setSandboxTool("set-pole")}>
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
                  <button disabled={!canUndo} onClick={undo} className={SOFT_BUTTON}>
                    Undo
                  </button>
                  <button disabled={!canRedo} onClick={redo} className={SOFT_BUTTON}>
                    Redo
                  </button>
                </div>
                <PuzzleButton />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
