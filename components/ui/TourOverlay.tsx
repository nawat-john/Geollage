"use client";

import { TOUR_STOPS } from "@/lib/data/tour";
import { useStudioStore } from "@/lib/store/useStudioStore";

export function TourOverlay() {
  const tourStopIndex = useStudioStore((s) => s.tourStopIndex);
  const nextTourStop = useStudioStore((s) => s.nextTourStop);
  const prevTourStop = useStudioStore((s) => s.prevTourStop);
  const exitTour = useStudioStore((s) => s.exitTour);

  if (tourStopIndex === null) return null;
  const stop = TOUR_STOPS[tourStopIndex];
  const isLast = tourStopIndex === TOUR_STOPS.length - 1;

  return (
    <div className="pointer-events-auto absolute bottom-36 left-1/2 w-[min(90vw,32rem)] -translate-x-1/2 rounded-xl bg-black/80 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {stop.title} <span className="font-normal text-white/50">— {stop.timeMa} Ma</span>
        </h3>
        <button onClick={exitTour} className="text-white/50 hover:text-white" aria-label="Exit tour">
          ×
        </button>
      </div>
      <p className="mb-3 text-sm text-white/80">{stop.caption}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50">
          {tourStopIndex + 1} / {TOUR_STOPS.length}
        </span>
        <div className="flex gap-2">
          <button
            disabled={tourStopIndex === 0}
            onClick={prevTourStop}
            className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
          >
            Back
          </button>
          <button
            onClick={isLast ? exitTour : nextTourStop}
            className="rounded bg-amber-400 px-3 py-1 text-xs font-medium text-black hover:bg-amber-300"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
