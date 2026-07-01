"use client";

import { downloadProjectFile, readProjectFile } from "@/lib/io/projectFile";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { useRef, useState } from "react";

export function FileMenu() {
  const status = useStudioStore((s) => s.status);
  const exportProject = useStudioStore((s) => s.exportProject);
  const importProject = useStudioStore((s) => s.importProject);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (status !== "ready") return null;

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
    <div className="pointer-events-auto flex gap-1 rounded-lg bg-black/70 p-1 backdrop-blur-sm">
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
