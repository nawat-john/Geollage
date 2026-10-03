"use client";

import { raySphereIntersection } from "@/lib/geo/raycast";
import { incrementalDragRotation } from "@/lib/geo/spherical";
import { ringOutlineSegments, triangulateRings, type MeshData } from "@/lib/geo/triangulate";
import { coastlinesForPlate } from "@/lib/model/coastlines";
import { orientationAtTime, plateCentroid, type Plate, type Quat } from "@/lib/model/plate";
import { isPiecePlaced } from "@/lib/model/puzzle";
import { suspendOrbit } from "@/lib/three/cameraRegistry";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  Quaternion,
  Uint32BufferAttribute,
  Vector3,
} from "three";

const PLATE_RADIUS = 1.004; // slightly above the base globe so tiles read as separate pieces
// Plates overlap (simplified boundaries, and widely mid-reconstruction), and a
// flat triangle spanning a few degrees sags ~0.001 below the sphere — more
// than any radius gap we could afford. So floors and land don't depth-test
// against each other at all: they skip depth writes and paint in a fixed
// per-plate order (renderOrder = layer), and only the opaque base globe's
// depth hides the far side. The small radius step just keeps that same
// order geometrically for anything that does depth-test (lines, markers).
export const RADIUS_LAYERS = 64;
const RADIUS_LAYER_STEP = 0.00003;
// Land sits above every plate's ocean floor (max ~1.0058), so continents stay
// visible even where a reconstruction overlaps two plates.
const LAND_LIFT = 0.0025;
const LINE_LIFT = 0.0004;
const CLICK_MOVE_TOLERANCE_PX = 5;

/** Layer for plates that weren't in the loaded set (cut pieces): a stable
 * FNV-1a hash of the id. Loaded plates get unique layers from their index. */
export function hashedRadiusLayer(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return ((hash ^ (hash >>> 15)) >>> 0) % RADIUS_LAYERS;
}

function capturePointer(e: ThreeEvent<PointerEvent>) {
  (e.target as Element).setPointerCapture(e.pointerId);
}
function releasePointer(e: ThreeEvent<PointerEvent>) {
  (e.target as Element).releasePointerCapture?.(e.pointerId);
}

function meshGeometry({ positions, normals, indices }: MeshData): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geo.setIndex(new Uint32BufferAttribute(indices, 1));
  return geo;
}

function lineGeometry(positions: number[]): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

/** Ocean floor, land, coast and boundary tints derived from the plate's own hue, so
 * each plate keeps its identity while continents read as land. */
function platePalette(color: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(color).getHSL(hsl);
  return {
    floor: new Color().setHSL(hsl.h, 0.34, 0.15),
    land: new Color().setHSL(hsl.h, 0.32, 0.6),
    coast: new Color().setHSL(hsl.h, 0.45, 0.85),
    boundary: new Color().setHSL(hsl.h, 0.85, 0.66),
  };
}

const PLACED_COLOR = new Color("#4ade80");
const ANCHOR_COLOR = "hsl(38, 70%, 55%)";

export function PlateMesh({ plate, layer }: { plate: Plate; layer: number }) {
  const meshRef = useRef<Mesh>(null!);
  // Accumulated rotation for the drag in progress; identity when not dragging.
  const dragQuatRef = useRef(new Quaternion());
  const lastDragPointRef = useRef<Vector3 | null>(null);
  // Set while twisting: the world axis the piece spins about (its own middle).
  const twistAxisRef = useRef<Vector3 | null>(null);

  const coastlines = useStudioStore((s) => s.coastlines);
  const radius = PLATE_RADIUS + (layer % RADIUS_LAYERS) * RADIUS_LAYER_STEP;

  const geometry = useMemo(() => meshGeometry(triangulateRings(plate.rings, radius)), [plate.rings, radius]);
  const boundary = useMemo(() => {
    const out: number[] = [];
    for (const ring of plate.rings) ringOutlineSegments(ring, radius + LINE_LIFT, out);
    return lineGeometry(out);
  }, [plate.rings, radius]);
  const coast = useMemo(() => coastlinesForPlate(plate, coastlines), [plate, coastlines]);
  const land = useMemo(
    () => (coast.length ? meshGeometry(triangulateRings(coast, radius + LAND_LIFT)) : null),
    [coast, radius],
  );
  const coastOutline = useMemo(() => {
    const out: number[] = [];
    for (const ring of coast) ringOutlineSegments(ring, radius + LAND_LIFT + LINE_LIFT, out);
    return lineGeometry(out);
  }, [coast, radius]);
  const isAnchor = useStudioStore((s) => !!s.puzzle?.anchorIds.includes(plate.id));
  const inPuzzle = useStudioStore((s) => s.puzzle !== null);
  // Puzzle anchors (Africa & co.) share one sand tone so the fixed target
  // stands apart from the colorful pieces being moved.
  const palette = useMemo(() => platePalette(isAnchor ? ANCHOR_COLOR : plate.color), [plate.color, isAnchor]);
  // Geometries passed as props aren't freed by R3F; plates come and go with
  // cuts, imports and the puzzle, so release GPU buffers ourselves.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => boundary.dispose(), [boundary]);
  useEffect(() => () => land?.dispose(), [land]);
  useEffect(() => () => coastOutline.dispose(), [coastOutline]);

  const centroid = useMemo(() => plateCentroid(plate).multiplyScalar(radius + 0.01), [plate, radius]);

  const labelRef = useRef<HTMLDivElement>(null);
  const labelWorld = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    const timeMa = useStudioStore.getState().timeMa;
    const base = orientationAtTime(plate, timeMa);
    meshRef.current.quaternion.copy(dragQuatRef.current).multiply(base);
    // HTML labels aren't depth-tested: hide the ones on the far side of the globe.
    const label = labelRef.current;
    if (label) {
      labelWorld.copy(centroid).applyQuaternion(meshRef.current.quaternion).normalize();
      const facing = labelWorld.dot(camera.position.clone().normalize());
      label.style.opacity = facing > 0.2 ? "1" : "0";
    }
  });

  const hoveredPlateId = useStudioStore((s) => s.hoveredPlateId);
  const selectedPlateId = useStudioStore((s) => s.selectedPlateId);
  const hoverPlate = useStudioStore((s) => s.hoverPlate);
  const selectPlate = useStudioStore((s) => s.selectPlate);
  const mode = useStudioStore((s) => s.mode);
  const sandboxTool = useStudioStore((s) => s.sandboxTool);
  const pinPlacing = useStudioStore((s) => s.pinPlacing);
  const puzzleTarget = useStudioStore((s) => s.puzzle?.targets[plate.id]);

  const isHovered = hoveredPlateId === plate.id;
  const isSelected = selectedPlateId === plate.id;
  const isDragging = useStudioStore((s) => s.draggingPlateId) === plate.id;
  const showLabels = useStudioStore((s) => s.showLabels);
  const isPlaced = !isAnchor && isPiecePlaced(plate.userTransform, puzzleTarget);
  // Puzzle anchors and pieces already snapped home can't be dragged.
  const locked = isAnchor || isPlaced;

  const glow = isDragging ? 0.22 : isSelected ? 0.14 : isHovered && !locked ? 0.12 : 0;

  return (
    <mesh
      ref={meshRef}
      renderOrder={layer}
      geometry={geometry}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoverPlate(plate.id);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (useStudioStore.getState().hoveredPlateId === plate.id) {
          hoverPlate(null);
        }
      }}
      onPointerDown={(e) => {
        if (mode !== "sandbox" || useStudioStore.getState().pinPlacing) return;
        const { sandboxTool, dragRotateMode, beginDrag, beginFreehandCut } = useStudioStore.getState();
        if (sandboxTool === "drag") {
          if (locked) return;
          e.stopPropagation();
          capturePointer(e);
          // Intersect the ray against the unit sphere directly (not the mesh
          // triangles) so this keeps working once pointer capture carries the
          // drag off this mesh's own geometry.
          const hit = raySphereIntersection(e.ray, 1);
          if (!hit) return;
          lastDragPointRef.current = hit;
          dragQuatRef.current.identity();
          twistAxisRef.current =
            dragRotateMode === "twist" || e.shiftKey
              ? plateCentroid(plate).applyQuaternion(meshRef.current.quaternion)
              : null;
          suspendOrbit();
          beginDrag(plate.id);
        } else if (sandboxTool === "cut-freehand") {
          e.stopPropagation();
          capturePointer(e);
          beginFreehandCut(plate.id, [e.point.x, e.point.y, e.point.z]);
        }
      }}
      onPointerMove={(e) => {
        if (mode !== "sandbox") return;
        const { sandboxTool, draggingPlateId, cuttingPlateId, dragRotateMode, eulerPole, addFreehandCutPoint } =
          useStudioStore.getState();
        if (sandboxTool === "drag" && draggingPlateId === plate.id) {
          e.stopPropagation();
          const from = lastDragPointRef.current;
          const to = raySphereIntersection(e.ray, 1);
          if (!from || !to) return;
          const pole =
            twistAxisRef.current ??
            (dragRotateMode === "pole" && eulerPole ? new Vector3(...eulerPole) : undefined);
          const incremental = incrementalDragRotation(from, to, pole);
          if (incremental) {
            dragQuatRef.current.premultiply(incremental);
          }
          lastDragPointRef.current = to;
        } else if (sandboxTool === "cut-freehand" && cuttingPlateId === plate.id) {
          e.stopPropagation();
          addFreehandCutPoint([e.point.x, e.point.y, e.point.z]);
        }
      }}
      onPointerUp={(e) => {
        if (mode !== "sandbox") return;
        const { sandboxTool, draggingPlateId, cuttingPlateId, commitPlateTransform, endDrag, endFreehandCut } =
          useStudioStore.getState();
        if (sandboxTool === "drag" && draggingPlateId === plate.id) {
          e.stopPropagation();
          releasePointer(e);
          const current = new Quaternion(...(plate.userTransform ?? [0, 0, 0, 1]));
          const next = dragQuatRef.current.clone().multiply(current);
          commitPlateTransform(plate.id, next.toArray() as Quat);
          dragQuatRef.current.identity();
          lastDragPointRef.current = null;
          twistAxisRef.current = null;
          endDrag();
        } else if (sandboxTool === "cut-freehand" && cuttingPlateId === plate.id) {
          e.stopPropagation();
          releasePointer(e);
          void endFreehandCut();
        }
      }}
      onClick={(e) => {
        if (pinPlacing) {
          e.stopPropagation();
          // Ignore the click that ends an orbit drag.
          if (e.delta > CLICK_MOVE_TOLERANCE_PX) return;
          useStudioStore.getState().placePinOnPlate(plate.id, [e.point.x, e.point.y, e.point.z]);
          return;
        }
        if (mode === "sandbox" && sandboxTool === "set-pole") {
          e.stopPropagation();
          const p = e.point.clone().normalize();
          useStudioStore.getState().setEulerPole([p.x, p.y, p.z]);
          useStudioStore.getState().setSandboxTool("drag");
          return;
        }
        if (mode === "sandbox" && sandboxTool === "cut-great-circle") {
          e.stopPropagation();
          void useStudioStore.getState().registerCutClick(plate.id, [e.point.x, e.point.y, e.point.z]);
          return;
        }
        e.stopPropagation();
        selectPlate(plate.id);
      }}
    >
      <meshStandardMaterial
        color={palette.floor}
        roughness={0.85}
        metalness={0}
        emissive="#ffffff"
        emissiveIntensity={glow}
        side={DoubleSide}
        depthWrite={false}
      />
      <lineSegments geometry={boundary} raycast={() => null}>
        <lineBasicMaterial
          color={isPlaced ? PLACED_COLOR : palette.boundary}
          transparent
          opacity={isSelected || isPlaced ? 0.95 : 0.45}
        />
      </lineSegments>
      {land && (
        <mesh geometry={land} renderOrder={RADIUS_LAYERS + layer} raycast={() => null}>
          <meshStandardMaterial
            color={palette.land}
            roughness={0.9}
            metalness={0}
            emissive="#ffffff"
            emissiveIntensity={glow * 0.6}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <lineSegments geometry={coastOutline} raycast={() => null}>
        <lineBasicMaterial color={isPlaced ? PLACED_COLOR : palette.coast} transparent opacity={0.65} />
      </lineSegments>
      {(showLabels || inPuzzle) && (
        <Html position={centroid} center zIndexRange={[5, 0]} className="pointer-events-none">
          <div
            ref={labelRef}
            className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white/90 transition-opacity duration-200"
          >
            {plate.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}
