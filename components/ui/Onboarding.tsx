"use client";

import { useStudioStore } from "@/lib/store/useStudioStore";
import { useEffect, useState } from "react";

const STORAGE_KEY = "tecto-studio-onboarding-seen";

export function Onboarding() {
  const status = useStudioStore((s) => s.status);
  // Start dismissed=false (matching the static server-rendered HTML, which
  // has no access to localStorage) and flip it after mount if the flag is
  // already set — the alternative (reading localStorage in the initial
  // state) renders differently on the server vs. a returning client and
  // causes a hydration mismatch.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.localStorage.getItem(STORAGE_KEY)) setDismissed(true);
  }, []);

  if (status !== "ready" || dismissed) return null;

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="mx-4 max-w-md rounded-2xl bg-black/90 p-6 text-white shadow-2xl ring-1 ring-white/10">
        <h2 className="mb-2 text-lg font-semibold">Welcome to Tecto Studio</h2>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-white/80">
          <li>Drag to orbit the globe; scroll to zoom.</li>
          <li>
            <strong>Time Machine</strong> mode plays plate motion from deep time to present —
            scrub the timeline or take the guided tour.
          </li>
          <li>
            <strong>Sandbox</strong> mode lets you drag plates by hand and cut them into pieces.
          </li>
          <li>
            Pin <strong>your place</strong> and watch where it was hundreds of millions of years ago, or try the{" "}
            <strong>Pangaea puzzle</strong>.
          </li>
          <li>Export your work or share a link any time — everything runs in your browser, no account needed.</li>
        </ul>
        <button
          onClick={dismiss}
          className="w-full rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black hover:bg-amber-300"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
