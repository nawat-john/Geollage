"use client";

import { EPOCHS } from "@/lib/data/epochs";
import { useStudioStore } from "@/lib/store/useStudioStore";

const SPEEDS = [5, 20, 60, 150];

export function Timeline() {
  const timeMa = useStudioStore((s) => s.timeMa);
  const minTimeMa = useStudioStore((s) => s.minTimeMa);
  const maxTimeMa = useStudioStore((s) => s.maxTimeMa);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const speed = useStudioStore((s) => s.playbackSpeedMaPerSec);
  const status = useStudioStore((s) => s.status);
  const mode = useStudioStore((s) => s.mode);
  const setTimeMa = useStudioStore((s) => s.setTimeMa);
  const togglePlay = useStudioStore((s) => s.togglePlay);
  const setPlaybackSpeed = useStudioStore((s) => s.setPlaybackSpeed);

  if (status !== "ready" || mode !== "reconstruction") return null;

  const range = maxTimeMa - minTimeMa || 1;

  return (
    <div
      role="region"
      aria-label="Timeline"
      className="pointer-events-auto absolute inset-x-0 bottom-0 bg-black/60 px-4 pt-6 pb-3 text-white backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <button
          onClick={togglePlay}
          aria-pressed={isPlaying}
          className="w-16 shrink-0 rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div className="relative flex-1">
          <input
            type="range"
            aria-label="Geological time, millions of years ago"
            min={minTimeMa}
            max={maxTimeMa}
            step={1}
            value={timeMa}
            onChange={(e) => setTimeMa(Number(e.target.value))}
            className="w-full accent-amber-400"
          />
          <div className="pointer-events-none absolute inset-x-0 top-full">
            {EPOCHS.filter((e) => e.timeMa >= minTimeMa && e.timeMa <= maxTimeMa).map(
              (epoch) => (
                <div
                  key={epoch.label}
                  className="absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-white/60"
                  style={{ left: `${((epoch.timeMa - minTimeMa) / range) * 100}%` }}
                  title={epoch.label}
                >
                  {epoch.label}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="w-20 shrink-0 text-right text-sm tabular-nums">
          {Math.round(timeMa)} Ma
        </div>

        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          className="shrink-0 rounded bg-white/10 px-2 py-1 text-sm"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s} className="text-black">
              {s} Ma/s
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
