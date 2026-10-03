"use client";

import { useGlobalShortcuts } from "@/lib/hooks/useGlobalShortcuts";
import { readProjectFile } from "@/lib/io/projectFile";
import { useStudioStore } from "@/lib/store/useStudioStore";
import dynamic from "next/dynamic";
import { useState } from "react";
import { AutosaveManager } from "./ui/AutosaveManager";
import { CreditsPanel } from "./ui/CreditsPanel";
import { FileMenu } from "./ui/FileMenu";
import { InspectorPanel } from "./ui/InspectorPanel";
import { Onboarding } from "./ui/Onboarding";
import { PuzzleWin } from "./ui/PuzzlePanel";
import { Timeline } from "./ui/Timeline";
import { Toolbar } from "./ui/Toolbar";
import { TourOverlay } from "./ui/TourOverlay";

const Scene = dynamic(() => import("./scene/Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
      Loading globe…
    </div>
  ),
});

export function StudioApp() {
  const importProject = useStudioStore((s) => s.importProject);
  const [dragActive, setDragActive] = useState(false);
  useGlobalShortcuts();

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const result = await readProjectFile(file);
    if (result.ok) importProject(result.project);
  }

  return (
    <div
      className="relative h-dvh w-dvw overflow-hidden bg-black"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <Scene />
      {/* z-10 keeps the panels above the 3D scene's HTML labels. */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <Toolbar />
        <div className="absolute top-3 right-3 left-3 flex items-start justify-end gap-2 sm:top-4 sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
          <FileMenu />
          <CreditsPanel />
        </div>
        <InspectorPanel />
        <PuzzleWin />
        <Timeline />
        <TourOverlay />
        <AutosaveManager />
        <Onboarding />
      </div>
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-4 border-dashed border-amber-400 bg-black/60 text-lg text-white">
          Drop a .tecto.json project file to load it
        </div>
      )}
    </div>
  );
}
