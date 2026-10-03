"use client";

import { PUZZLE_TIME_MA, isPiecePlaced, pieceErrorDeg } from "@/lib/model/puzzle";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { useState } from "react";

/** How close a piece is, as a friendly 0–100 "fit" (90° or more off = 0). */
function fitPercent(errorDeg: number): number {
  return Math.max(0, Math.round(100 - (errorDeg / 90) * 100));
}

function usePieces() {
  const plates = useStudioStore((s) => s.plates);
  const puzzle = useStudioStore((s) => s.puzzle);
  if (!puzzle) return [];
  return plates
    .filter((p) => !puzzle.anchorIds.includes(p.id))
    .map((p) => {
      const target = puzzle.targets[p.id];
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        placed: isPiecePlaced(p.userTransform, target),
        fit: target ? fitPercent(pieceErrorDeg(p.userTransform, target)) : 0,
      };
    });
}

export function PuzzlePanel() {
  const puzzle = useStudioStore((s) => s.puzzle);
  const dragRotateMode = useStudioStore((s) => s.dragRotateMode);
  const setDragRotateMode = useStudioStore((s) => s.setDragRotateMode);
  const togglePuzzleHint = useStudioStore((s) => s.togglePuzzleHint);
  const exitPuzzle = useStudioStore((s) => s.exitPuzzle);
  const undo = useStudioStore((s) => s.undo);
  const canUndo = useStudioStore((s) => s.history.past.length > 0);
  const selectPlate = useStudioStore((s) => s.selectPlate);
  const pieces = usePieces();
  if (!puzzle) return null;

  const placed = pieces.filter((p) => p.placed).length;
  const twist = dragRotateMode === "twist";
  const segment = (on: boolean) =>
    `flex-1 rounded-md px-2 py-1 text-xs font-medium ${on ? "bg-amber-400 text-black" : "text-white/80 hover:bg-white/10"}`;

  return (
    <div
      role="region"
      aria-label="Pangaea puzzle"
      className="w-64 rounded-xl bg-black/70 p-3 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md"
    >
      <h2 className="text-sm font-semibold">Rebuild Pangaea</h2>
      <p className="mt-1 text-xs text-white/65">
        {`Drag the continents back around Africa, the way they sat ~${PUZZLE_TIME_MA} million years ago. Pieces snap in when they're close.`}
      </p>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-white/60">Placed</span>
        <span className="font-medium tabular-nums">
          {placed} / {pieces.length}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-green-400 transition-all duration-500"
          style={{ width: `${pieces.length ? (placed / pieces.length) * 100 : 0}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1">
        {pieces.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => selectPlate(p.id)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-white/5"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.placed ? (
                <span className="text-green-400" aria-label="placed">
                  ✓
                </span>
              ) : (
                <span className="text-white/50 tabular-nums">{p.fit}%</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-1 rounded-lg bg-white/5 p-0.5" role="group" aria-label="Drag action">
        <button aria-pressed={!twist} className={segment(!twist)} onClick={() => setDragRotateMode("free")}>
          Move
        </button>
        <button aria-pressed={twist} className={segment(twist)} onClick={() => setDragRotateMode("twist")}>
          Twist
        </button>
      </div>
      <p className="mt-1 text-[11px] text-white/45">Tip: Shift + drag twists too. Drag open space to turn the globe.</p>

      <div className="mt-3 flex gap-1">
        <button
          onClick={togglePuzzleHint}
          aria-pressed={puzzle.showHint}
          className="flex-1 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          {puzzle.showHint ? "Hide hint" : "Show hint"}
        </button>
        <button
          onClick={undo}
          disabled={!canUndo}
          className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
        >
          Undo
        </button>
        <button onClick={exitPuzzle} className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
          Quit
        </button>
      </div>
    </div>
  );
}

/** Celebration card once every piece is home. */
export function PuzzleWin() {
  const puzzle = useStudioStore((s) => s.puzzle);
  const pieces = usePieces();
  const [dismissedFor, setDismissedFor] = useState<object | null>(null);
  const won = !!puzzle && pieces.length > 0 && pieces.every((p) => p.placed);
  // Keyed on the puzzle's targets object so a new game shows the card again.
  if (!won || dismissedFor === puzzle.targets) return null;

  function seeInTimeMachine() {
    const s = useStudioStore.getState();
    s.setMode("reconstruction"); // also leaves the puzzle and restores the user's plates
    s.setTimeMa(PUZZLE_TIME_MA);
  }

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40">
      <div className="w-[min(90vw,24rem)] rounded-2xl bg-black/90 p-6 text-center text-white shadow-2xl ring-1 ring-green-400/40">
        <div className="text-4xl" aria-hidden="true">
          🌍
        </div>
        <h2 className="mt-2 text-lg font-semibold">You rebuilt Pangaea!</h2>
        <p className="mt-1 text-sm text-white/70">
          {`Every continent is back where it sat ~${PUZZLE_TIME_MA} million years ago — one supercontinent, one ocean.`}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={seeInTimeMachine}
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black hover:bg-amber-300"
          >
            Watch it break apart in the Time Machine
          </button>
          <button
            onClick={() => setDismissedFor(puzzle.targets)}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
          >
            Keep admiring it
          </button>
        </div>
      </div>
    </div>
  );
}
