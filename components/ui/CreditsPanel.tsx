"use client";

import { useStudioStore } from "@/lib/store/useStudioStore";
import { useState } from "react";

export function CreditsPanel() {
  const status = useStudioStore((s) => s.status);
  const attribution = useStudioStore((s) => s.attribution);
  const [open, setOpen] = useState(false);

  if (status !== "ready" || !attribution) return null;

  return (
    <div className="pointer-events-auto relative">
      {open ? (
        <div
          role="dialog"
          aria-label="Data and credits"
          className="absolute top-0 right-0 z-10 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl bg-black/90 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
        >
          <div className="mb-2 flex items-start justify-between">
            <h2 className="text-sm font-semibold">Data &amp; credits</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white"
              aria-label="Close data and credits"
            >
              ×
            </button>
          </div>
          <dl className="space-y-2 text-xs text-white/80">
            <div>
              <dt className="text-white/50">Reconstruction model</dt>
              <dd>{attribution.title}</dd>
            </div>
            <div>
              <dt className="text-white/50">Citation</dt>
              <dd>{attribution.citation}</dd>
            </div>
            <div>
              <dt className="text-white/50">Data service</dt>
              <dd>{attribution.dataService}</dd>
            </div>
            <div>
              <dt className="text-white/50">License</dt>
              <dd>{attribution.license}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-black/65 px-3 py-2 text-xs text-white/70 shadow-xl ring-1 ring-white/10 backdrop-blur-md hover:text-white"
        >
          Data &amp; credits
        </button>
      )}
    </div>
  );
}
