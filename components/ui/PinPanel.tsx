"use client";

import { vec3ToLonLat } from "@/lib/geo/spherical";
import { orientationAtTime } from "@/lib/model/plate";
import { formatLonLat, resolvePinPlate, useStudioStore } from "@/lib/store/useStudioStore";
import { useMemo, useState } from "react";
import { Vector3 } from "three";

const EARTH_RADIUS_KM = 6371;

/** "Where was my home?" — pin a place and read off where it sat back then. */
export function PinPanel() {
  const pin = useStudioStore((s) => s.pin);
  const plates = useStudioStore((s) => s.plates);
  const timeMa = useStudioStore((s) => s.timeMa);
  const pinPlacing = useStudioStore((s) => s.pinPlacing);
  const setPinPlacing = useStudioStore((s) => s.setPinPlacing);
  const placePinAtLonLat = useStudioStore((s) => s.placePinAtLonLat);
  const clearPin = useStudioStore((s) => s.clearPin);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const plate = useMemo(() => (pin ? resolvePinPlate(plates, pin) : undefined), [pin, plates]);

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setGeoError("Location isn't available in this browser — click the globe instead.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        placePinAtLonLat(pos.coords.longitude, pos.coords.latitude, "Your location");
        useStudioStore.getState().focusPin();
      },
      () => {
        setLocating(false);
        setGeoError("Couldn't get your location — click the globe instead.");
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  let then: { coords: string; km: number } | null = null;
  if (pin && plate && Math.round(timeMa) > 0) {
    const local = new Vector3(...pin.local);
    const now = local.clone().applyQuaternion(orientationAtTime(plate, 0));
    const past = local.clone().applyQuaternion(orientationAtTime(plate, timeMa));
    const [lon, lat] = vec3ToLonLat(past);
    then = { coords: formatLonLat(lon, lat), km: now.angleTo(past) * EARTH_RADIUS_KM };
  }

  const today = pin ? formatLonLat(...vec3ToLonLat(new Vector3(...pin.local))) : null;

  return (
    <div className="rounded-xl bg-black/65 p-3 shadow-xl ring-1 ring-white/10 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px] shadow-rose-500" />
        Your place through time
      </div>

      {pinPlacing ? (
        <div className="space-y-2 text-xs">
          <p className="text-amber-300">Click a spot on any plate…</p>
          <button onClick={() => setPinPlacing(false)} className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
            Cancel
          </button>
        </div>
      ) : pin ? (
        <div className="space-y-1.5 text-xs">
          <p className="font-medium text-white">{pin.label}</p>
          <p className="text-white/60">Today: {today}</p>
          {!plate ? (
            <p className="text-white/50">Not on any plate right now.</p>
          ) : then ? (
            <p className="text-white/90">
              {Math.round(timeMa)} Ma ago: <span className="text-rose-300">{then.coords}</span>
              <br />
              <span className="text-white/60">
                {Math.round(then.km).toLocaleString("en-US")} km from where it is today
              </span>
            </p>
          ) : (
            <p className="text-white/50">Drag the timeline to see where it was.</p>
          )}
          <div className="flex gap-1 pt-1">
            <button onClick={() => setPinPlacing(true)} className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
              Move pin
            </button>
            <button onClick={clearPin} className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <p className="text-white/60">Pin a place and watch it drift across the ages.</p>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={locateMe}
              disabled={locating}
              className="rounded-md bg-rose-500 px-2 py-1 font-medium text-white hover:bg-rose-400 disabled:opacity-50"
            >
              {locating ? "Locating…" : "Use my location"}
            </button>
            <button onClick={() => setPinPlacing(true)} className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20">
              Pin a place
            </button>
          </div>
        </div>
      )}
      {geoError && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {geoError}
        </p>
      )}
    </div>
  );
}
