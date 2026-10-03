"use client";

import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { ringOutlineSegments } from "@/lib/geo/triangulate";
import { coastlinesForPlate } from "@/lib/model/coastlines";
import { baseOrientationAtTime, orientationAtTime, plateCentroid, surfaceVelocity } from "@/lib/model/plate";
import { isPiecePlaced } from "@/lib/model/puzzle";
import { registerCamera, registerControls } from "@/lib/three/cameraRegistry";
import { resolvePinPlate, useStudioStore } from "@/lib/store/useStudioStore";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowHelper,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Globe } from "./Globe";
import { PlateMesh, hashedRadiusLayer } from "./PlateMesh";

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

/** Keeps a group rotated with a plate, so overlays ride along with it. */
function useFollowPlate(groupRef: React.RefObject<Group | null>, plateId: string | undefined) {
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const { plates, timeMa } = useStudioStore.getState();
    const plate = plates.find((p) => p.id === plateId);
    if (plate) group.quaternion.copy(orientationAtTime(plate, timeMa));
  });
}

function HoverLabel() {
  const plates = useStudioStore((s) => s.plates);
  const hoveredPlateId = useStudioStore((s) => s.hoveredPlateId);
  const draggingPlateId = useStudioStore((s) => s.draggingPlateId);
  const showLabels = useStudioStore((s) => s.showLabels || s.puzzle !== null);
  const plate = plates.find((p) => p.id === hoveredPlateId);
  const groupRef = useRef<Group>(null);
  useFollowPlate(groupRef, plate?.id);
  const anchor = useMemo(() => (plate ? plateCentroid(plate).multiplyScalar(1.03) : null), [plate]);
  // With labels on every plate is already named; a label chasing a dragged piece is just noise.
  if (!plate || !anchor || showLabels || draggingPlateId) return null;
  return (
    <group ref={groupRef}>
      <Html position={anchor} center zIndexRange={[6, 0]} className="pointer-events-none">
        <div className="rounded-md bg-black/75 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg ring-1 ring-white/10">
          {plate.name}
        </div>
      </Html>
    </group>
  );
}

const ARROW_COLOR = new Color("#fde68a");
const ARROW_MIN_CM_PER_YR = 0.3;

/** One arrow per plate at its middle, pointing where it is heading (forward
 * in time), with length proportional to its speed. */
function MotionArrows() {
  const plates = useStudioStore((s) => s.plates);
  const arrows = useMemo(
    () =>
      plates.map((plate) => ({
        plate,
        local: plateCentroid(plate),
        arrow: new ArrowHelper(new Vector3(0, 1, 0), new Vector3(), 0.1, ARROW_COLOR, 0.03, 0.022),
      })),
    [plates],
  );
  useEffect(() => () => arrows.forEach(({ arrow }) => arrow.dispose()), [arrows]);
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const { timeMa } = useStudioStore.getState();
    for (let i = 0; i < arrows.length; i++) {
      const { plate, local } = arrows[i];
      const arrow = group.children[i] as ArrowHelper | undefined;
      if (!arrow) continue;
      const v = surfaceVelocity(plate, local, timeMa);
      if (!v || v.cmPerYr < ARROW_MIN_CM_PER_YR) {
        arrow.visible = false;
        continue;
      }
      arrow.visible = true;
      arrow.position.copy(v.position).multiplyScalar(1.014);
      arrow.setDirection(v.direction);
      arrow.setLength(Math.min(0.32, 0.035 + v.cmPerYr * 0.016), 0.03, 0.022);
    }
  });

  return (
    <group ref={groupRef}>
      {arrows.map(({ plate, arrow }) => (
        <primitive key={plate.id} object={arrow} raycast={() => null} />
      ))}
    </group>
  );
}

const PIN_COLOR = "#f43f5e";
const TRAIL_STEP_MA = 10;
const UP = new Vector3(0, 1, 0);

/** The pinned place: a marker riding its plate, plus (in the Time Machine)
 * the path it traces through deep time, bright near today and fading out. */
function PinMarker() {
  const pin = useStudioStore((s) => s.pin);
  const plates = useStudioStore((s) => s.plates);
  const mode = useStudioStore((s) => s.mode);
  const maxTimeMa = useStudioStore((s) => s.maxTimeMa);
  const plate = useMemo(() => (pin ? resolvePinPlate(plates, pin) : undefined), [pin, plates]);
  const local = useMemo(() => (pin ? new Vector3(...pin.local) : null), [pin]);
  const groupRef = useRef<Group>(null);
  const pulseRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !plate || !local) return;
    const world = local.clone().applyQuaternion(orientationAtTime(plate, useStudioStore.getState().timeMa));
    group.position.copy(world);
    group.quaternion.setFromUnitVectors(UP, world);
    const pulse = pulseRef.current;
    if (pulse) {
      const k = (clock.elapsedTime * 0.8) % 1;
      pulse.scale.setScalar(1 + k * 2.5);
      (pulse.material as MeshBasicMaterial).opacity = 0.6 * (1 - k);
    }
  });

  // The path from today back to the current time only — the full 1.8 Gyr
  // path loops over itself into an unreadable scribble. Recomputed per
  // TRAIL_STEP_MA of scrubbing, not per frame.
  const trailSteps = useStudioStore((s) => Math.floor(s.timeMa / TRAIL_STEP_MA));
  const trail = useMemo(() => {
    if (!plate || !local || plate.rotations.length < 2 || maxTimeMa <= 0 || trailSteps < 1) return null;
    const points: Vector3[] = [];
    const colors: Color[] = [];
    const near = new Color(PIN_COLOR);
    const far = new Color("#7c3aed");
    for (let i = 0; i <= trailSteps; i++) {
      const t = Math.min(i * TRAIL_STEP_MA, maxTimeMa);
      points.push(local.clone().applyQuaternion(orientationAtTime(plate, t)).multiplyScalar(1.009));
      colors.push(near.clone().lerp(far, t / maxTimeMa));
    }
    return { points, colors };
  }, [plate, local, maxTimeMa, trailSteps]);

  if (!pin || !plate) return null;
  return (
    <>
      {mode === "reconstruction" && trail && (
        <Line points={trail.points} vertexColors={trail.colors} lineWidth={1.6} transparent opacity={0.8} />
      )}
      <group ref={groupRef}>
        <mesh position={[0, 0.03, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.06, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.065, 0]} raycast={() => null}>
          <sphereGeometry args={[0.014, 20, 20]} />
          <meshBasicMaterial color={PIN_COLOR} />
        </mesh>
        <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} raycast={() => null}>
          <ringGeometry args={[0.012, 0.018, 32]} />
          <meshBasicMaterial color={PIN_COLOR} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

/** Puzzle hint: where each unplaced piece's coastline belongs, as a ghost. */
function PuzzleGhosts() {
  const puzzle = useStudioStore((s) => s.puzzle);
  const plates = useStudioStore((s) => s.plates);
  const coastlines = useStudioStore((s) => s.coastlines);
  const ghosts = useMemo(() => {
    if (!puzzle?.showHint) return [];
    return plates
      .filter((p) => !puzzle.anchorIds.includes(p.id) && !isPiecePlaced(p.userTransform, puzzle.targets[p.id]))
      .map((plate) => {
        const out: number[] = [];
        for (const ring of coastlinesForPlate(plate, coastlines)) ringOutlineSegments(ring, 1.009, out);
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(out, 3));
        // The puzzle runs at t = 0, so a placed piece renders at target · base(0).
        const pose = new Quaternion(...puzzle.targets[plate.id]).multiply(baseOrientationAtTime(plate, 0));
        return { id: plate.id, geo, pose };
      });
  }, [puzzle, plates, coastlines]);
  useEffect(() => () => ghosts.forEach((g) => g.geo.dispose()), [ghosts]);

  return (
    <>
      {ghosts.map((g) => (
        <lineSegments key={g.id} geometry={g.geo} quaternion={g.pose} raycast={() => null}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.55} />
        </lineSegments>
      ))}
    </>
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
  const basePlates = useStudioStore((s) => s.basePlates);
  const layerOf = useMemo(() => new Map(basePlates.map((p, i) => [p.id, i])), [basePlates]);
  const mode = useStudioStore((s) => s.mode);
  const sandboxTool = useStudioStore((s) => s.sandboxTool);
  const showMotion = useStudioStore((s) => s.showMotion);
  const draggingPlateId = useStudioStore((s) => s.draggingPlateId);
  // With the drag tool, grabbing open space still turns the globe; only an
  // actual plate drag (or freehand drawing) takes the pointer away from orbit.
  const orbitEnabled = !draggingPlateId && !(mode === "sandbox" && sandboxTool === "cut-freehand");
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#bcd7ff", "#1a1408", 0.5]} />
      <directionalLight position={[3, 2, 5]} intensity={1.6} />
      <Globe />
      {plates.map((plate) => (
        <PlateMesh key={plate.id} plate={plate} layer={layerOf.get(plate.id) ?? hashedRadiusLayer(plate.id)} />
      ))}
      {showMotion && mode === "reconstruction" && <MotionArrows />}
      <PinMarker />
      <PuzzleGhosts />
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
    <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_center,#0c1a36_0%,#05070f_55%,#000_100%)]">
      <Canvas camera={{ position: [0, 0, 2.8], fov: 45, near: 0.3, far: 400 }} dpr={[1, 2]}>
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
