"use client";

import { clearAutosave, loadAutosave, saveAutosave } from "@/lib/io/idb";
import type { ProjectFileV1 } from "@/lib/io/projectFile";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { useEffect, useRef, useState } from "react";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Persists the working project to IndexedDB as it changes, and offers to
 * restore it on a fresh load — the only "crash recovery" possible with no
 * backend: everything lives in the browser until exported. */
export function AutosaveManager() {
  const status = useStudioStore((s) => s.status);
  const exportProject = useStudioStore((s) => s.exportProject);
  const importProject = useStudioStore((s) => s.importProject);
  const plates = useStudioStore((s) => s.plates);
  const mode = useStudioStore((s) => s.mode);
  const inPuzzle = useStudioStore((s) => s.puzzle !== null);

  const [recoverable, setRecoverable] = useState<ProjectFileV1 | null>(null);
  const checkedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offer to restore an autosave once, right after data loads.
  useEffect(() => {
    if (status !== "ready" || checkedRef.current) return;
    checkedRef.current = true;
    loadAutosave().then((project) => {
      if (project) setRecoverable(project);
    });
  }, [status]);

  // Debounced autosave whenever the working plates/mode change.
  useEffect(() => {
    // Don't clobber a pending recovery offer, and never save puzzle pieces
    // over the user's real work.
    if (status !== "ready" || recoverable || inPuzzle) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveAutosave(exportProject());
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, plates, mode, recoverable, inPuzzle]);

  if (!recoverable || inPuzzle) return null;

  return (
    <div className="pointer-events-auto absolute bottom-40 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/80 px-4 py-2 text-sm text-white backdrop-blur-sm">
      <span>Restore your previous session?</span>
      <button
        className="rounded bg-amber-400 px-2 py-1 text-xs font-medium text-black hover:bg-amber-300"
        onClick={() => {
          importProject(recoverable);
          setRecoverable(null);
        }}
      >
        Restore
      </button>
      <button
        className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        onClick={() => {
          void clearAutosave();
          setRecoverable(null);
        }}
      >
        Discard
      </button>
    </div>
  );
}
