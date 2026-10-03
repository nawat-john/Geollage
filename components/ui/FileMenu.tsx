"use client";

import { vec3ToLonLat } from "@/lib/geo/spherical";
import { downloadProjectFile, readProjectFile } from "@/lib/io/projectFile";
import { encodeShareHash } from "@/lib/io/shareLink";
import { snapshotCamera } from "@/lib/three/cameraRegistry";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { Vector3 } from "three";
import { useRef, useState } from "react";

export function FileMenu() {
  const status = useStudioStore((s) => s.status);
  const exportProject = useStudioStore((s) => s.exportProject);
  const importProject = useStudioStore((s) => s.importProject);
  const inPuzzle = useStudioStore((s) => s.puzzle !== null);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (status !== "ready" || inPuzzle) return null;

  /** Copies a link that reopens this exact view: time, camera and pinned place. */
  async function share() {
    const { timeMa, pin } = useStudioStore.getState();
    const [lon, lat] = pin ? vec3ToLonLat(new Vector3(...pin.local)) : [0, 0];
    const hash = encodeShareHash({
      timeMa,
      camera: snapshotCamera().position,
      pin: pin ? { lon, lat, label: pin.label } : undefined,
    });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied!");
    } catch {
      setShareNote("Copy the link from the address bar");
    }
    setTimeout(() => setShareNote(null), 2500);
  }

  async function handleFile(file: File) {
    const result = await readProjectFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    importProject(result.project);
  }

  return (
    <div className="pointer-events-auto relative flex gap-1 rounded-xl bg-black/65 p-1 shadow-xl ring-1 ring-white/10 backdrop-blur-md">
      <button
        onClick={() => downloadProjectFile(exportProject())}
        className="rounded px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
      >
        Export
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="rounded px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
      >
        Import
      </button>
      <button
        onClick={() => void share()}
        className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-400"
      >
        Share link
      </button>
      {shareNote && (
        <span
          role="status"
          className="absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-xs whitespace-nowrap text-white ring-1 ring-white/10"
        >
          {shareNote}
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.tecto.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error && (
        <span className="max-w-48 self-center truncate px-1 text-xs text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
