import { useStudioStore } from "@/lib/store/useStudioStore";
import { useEffect } from "react";

const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** Space toggles reconstruction playback, unless focus is in a form control. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && EDITABLE_TAGS.has(target.tagName)) return;

      const { mode, status, togglePlay } = useStudioStore.getState();
      if (status !== "ready" || mode !== "reconstruction") return;
      e.preventDefault();
      togglePlay();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
