"use client";

import { EPOCHS, PERIODS, nearbyEpoch, periodAt } from "@/lib/data/epochs";
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
  const pct = (ma: number) => ((Math.min(maxTimeMa, Math.max(minTimeMa, ma)) - minTimeMa) / range) * 100;
  const period = periodAt(timeMa);
  const epoch = nearbyEpoch(timeMa);
  const rounded = Math.round(timeMa);

  return (
    <div
      role="region"
      aria-label="Timeline"
      className="pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-3 text-white sm:px-4 sm:pb-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl bg-black/70 px-4 pt-3 pb-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={togglePlay}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
          >
            {isPlaying ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="ml-0.5 h-4 w-4" aria-hidden="true">
                <path d="M4 2.5v11a.7.7 0 0 0 1.06.6l9-5.5a.7.7 0 0 0 0-1.2l-9-5.5A.7.7 0 0 0 4 2.5Z" fill="currentColor" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl leading-none font-semibold tabular-nums">{rounded} Ma</span>
              <span className="truncate text-xs text-white/55">
                {rounded === 0 ? "today" : "million years ago"}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
              {period && (
                <span className="flex shrink-0 items-center gap-1.5 text-white/80">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: period.color }} />
                  {period.name}
                </span>
              )}
              {epoch && epoch.timeMa !== 0 && (
                <span className="truncate text-amber-300">· {epoch.label}</span>
              )}
            </div>
          </div>

          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="shrink-0 rounded-lg bg-white/10 px-2 py-1.5 text-xs ring-1 ring-white/10"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s} className="text-black">
                {s} Ma/s
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <input
            type="range"
            aria-label="Geological time, millions of years ago"
            min={minTimeMa}
            max={maxTimeMa}
            step={1}
            value={timeMa}
            onChange={(e) => setTimeMa(Number(e.target.value))}
            className="block w-full accent-amber-400"
          />
          {/* Geologic periods as a color band, ICS chart colors. */}
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            {PERIODS.filter((p) => p.endMa < maxTimeMa && p.startMa > minTimeMa).map((p) => (
              <div
                key={p.name}
                className="absolute inset-y-0 opacity-80"
                style={{
                  left: `${pct(p.endMa)}%`,
                  width: `${pct(p.startMa) - pct(p.endMa)}%`,
                  backgroundColor: p.color,
                }}
              />
            ))}
          </div>
          {/* Well-known events: click to jump, hover for the name. */}
          <div className="relative h-3">
            {EPOCHS.filter((e) => e.timeMa > minTimeMa && e.timeMa <= maxTimeMa).map((e) => (
              <button
                key={e.label}
                onClick={() => setTimeMa(e.timeMa)}
                aria-label={`Jump to ${e.label} (${e.timeMa} Ma)`}
                className="group absolute top-0.5 -translate-x-1/2 p-0.5"
                style={{ left: `${pct(e.timeMa)}%` }}
              >
                <span className="block h-1.5 w-1.5 rotate-45 bg-white/60 transition group-hover:bg-amber-300" />
                <span
                  className={`pointer-events-none absolute bottom-full mb-6 rounded ${
                    pct(e.timeMa) > 85 ? "right-0" : pct(e.timeMa) < 15 ? "left-0" : "left-1/2 -translate-x-1/2"
                  } bg-black/90 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white opacity-0 ring-1 ring-white/10 transition group-hover:opacity-100 group-focus-visible:opacity-100`}
                >
                  {e.label} · {e.timeMa} Ma
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
