"use client";

import { instantaneousMotion, isIdentityQuat, plateCentroid, surfaceVelocity } from "@/lib/model/plate";
import { useStudioStore } from "@/lib/store/useStudioStore";

export function InspectorPanel() {
  const plates = useStudioStore((s) => s.plates);
  const selectedPlateId = useStudioStore((s) => s.selectedPlateId);
  const selectPlate = useStudioStore((s) => s.selectPlate);
  const mode = useStudioStore((s) => s.mode);
  const timeMa = useStudioStore((s) => s.timeMa);
  const resetPlateTransform = useStudioStore((s) => s.resetPlateTransform);
  const inPuzzle = useStudioStore((s) => s.puzzle !== null);
  const plate = plates.find((p) => p.id === selectedPlateId);

  if (!plate || inPuzzle) return null;

  const hasCustomTransform = !!plate.userTransform && !isIdentityQuat(plate.userTransform);
  const parent = plate.derivedFrom ? plates.find((p) => p.id === plate.derivedFrom) : undefined;
  const motion = mode === "reconstruction" ? instantaneousMotion(plate, timeMa) : null;
  const velocity = motion ? surfaceVelocity(plate, plateCentroid(plate), timeMa) : null;

  return (
    <div
      role="region"
      aria-label="Plate inspector"
      className="pointer-events-auto absolute right-3 bottom-40 w-64 rounded-xl bg-black/65 p-4 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md sm:top-4 sm:right-4 sm:bottom-auto"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: plate.color }}
          />
          <h2 className="text-sm font-semibold">{plate.name}</h2>
        </div>
        <button
          onClick={() => selectPlate(null)}
          className="text-white/50 hover:text-white"
          aria-label="Close plate inspector"
        >
          ×
        </button>
      </div>
      <dl className="space-y-1 text-xs text-white/80">
        <div className="flex justify-between">
          <dt>Plate ID</dt>
          <dd>{plate.plateId ?? "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Rings</dt>
          <dd>{plate.rings.length}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Rotation keyframes</dt>
          <dd>{plate.rotations.length}</dd>
        </div>
        {parent && (
          <div className="flex justify-between">
            <dt>Cut from</dt>
            <dd className="truncate pl-2" title={parent.name}>
              {parent.name}
            </dd>
          </div>
        )}
      </dl>
      {motion && (
        <div className="mt-3 border-t border-white/10 pt-2 text-xs text-white/80">
          <p className="mb-1 text-white/50">Euler pole (instantaneous)</p>
          <div className="flex justify-between">
            <dt>Pole (lon, lat)</dt>
            <dd>
              {motion.poleLon.toFixed(1)}°, {motion.poleLat.toFixed(1)}°
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Angular speed</dt>
            <dd>{motion.degPerMyr.toFixed(2)}°/Myr</dd>
          </div>
          {velocity && (
            <div className="flex justify-between">
              <dt>Speed at its middle</dt>
              <dd className="text-amber-200">{velocity.cmPerYr.toFixed(1)} cm/yr</dd>
            </div>
          )}
        </div>
      )}
      {mode === "sandbox" && (
        <button
          disabled={!hasCustomTransform}
          onClick={() => resetPlateTransform(plate.id)}
          className="mt-3 w-full rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
        >
          Reset position
        </button>
      )}
    </div>
  );
}
