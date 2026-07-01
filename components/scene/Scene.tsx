"use client";

import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { registerCamera, registerControls } from "@/lib/three/cameraRegistry";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Globe } from "./Globe";
import { PlateMesh } from "./PlateMesh";

function PlaybackDriver() {
  useFrame((_, delta) => {
    const { isPlaying, timeMa, maxTimeMa, playbackSpeedMaPerSec, setTimeMa, pause } =
      useStudioStore.getState();
    if (!isPlaying) return;
    const next = timeMa + delta * playbackSpeedMaPerSec;
    if (next >= maxTimeMa) {
      setTimeMa(maxTimeMa);
      pause();
    } else {
      setTimeMa(next);
    }
  });
  return null;
}

function HoverLabel() {
  const plates = useStudioStore((s) => s.plates);
  const hoveredPlateId = useStudioStore((s) => s.hoveredPlateId);
  const plate = plates.find((p) => p.id === hoveredPlateId);
  if (!plate) return null;
  return (
    <Html center distanceFactor={3} className="pointer-events-none">
      <div className="rounded bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white">
        {plate.name}
      </div>
    </Html>
  );
}

function EulerPoleMarker() {
  const eulerPole = useStudioStore((s) => s.eulerPole);
  const dragRotateMode = useStudioStore((s) => s.dragRotateMode);
  if (!eulerPole || dragRotateMode !== "pole") return null;
  return (
    <mesh position={eulerPole}>
      <sphereGeometry args={[0.015, 12, 12]} />
      <meshBasicMaterial color="#facc15" />
    </mesh>
  );
}

function CutPreview() {
  const points = useStudioStore((s) => s.cutPreviewPoints);
  if (points.length === 0) return null;
  return (
    <>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.008, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      {points.length > 1 && <Line points={points} color="#ffffff" lineWidth={2} />}
    </>
  );
}

/** Registers the live camera/controls so non-R3F code (export) can read the
 * current pose, and applies any camera pose that just came from an import. */
function CameraBridge({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera);
  const cameraRef = useRef(camera);
  const pendingCamera = useStudioStore((s) => s.pendingCamera);
  const consumePendingCamera = useStudioStore((s) => s.consumePendingCamera);

  useEffect(() => {
    cameraRef.current = camera;
    registerCamera(camera);
    return () => registerCamera(null);
  }, [camera]);

  useEffect(() => {
    if (!pendingCamera) return;
    const cam = cameraRef.current;
    cam.position.set(...pendingCamera.position);
    if ("zoom" in cam) {
      (cam as unknown as { zoom: number }).zoom = pendingCamera.zoom;
      cam.updateProjectionMatrix();
    }
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...pendingCamera.target);
      controls.update();
    }
    consumePendingCamera();
  }, [pendingCamera, controlsRef, consumePendingCamera]);

  return null;
}

function SceneContents() {
  const plates = useStudioStore((s) => s.plates);
  const mode = useStudioStore((s) => s.mode);
  const sandboxTool = useStudioStore((s) => s.sandboxTool);
  const orbitEnabled = !(mode === "sandbox" && (sandboxTool === "drag" || sandboxTool === "cut-freehand"));
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 2, 5]} intensity={1.5} />
      <Globe />
      {plates.map((plate) => (
        <PlateMesh key={plate.id} plate={plate} />
      ))}
      <HoverLabel />
      <EulerPoleMarker />
      <CutPreview />
      <PlaybackDriver />
      <CameraBridge controlsRef={controlsRef} />
      <OrbitControls
        ref={(c) => {
          controlsRef.current = c;
          registerControls(c);
        }}
        enabled={orbitEnabled}
        enablePan={false}
        enableDamping={!reducedMotion}
        minDistance={1.4}
        maxDistance={5}
        rotateSpeed={0.5}
      />
    </>
  );
}

export default function Scene() {
  const status = useStudioStore((s) => s.status);
  const error = useStudioStore((s) => s.error);
  const loadData = useStudioStore((s) => s.loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [0, 0, 2.8], fov: 45 }}>
        <SceneContents />
      </Canvas>
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/80">
          Loading plate data…
        </div>
      )}
      {status === "error" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-red-400">
          Failed to load plate data: {error}
        </div>
      )}
    </div>
  );
}
