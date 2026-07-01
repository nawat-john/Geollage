"use client";

import { raySphereIntersection } from "@/lib/geo/raycast";
import { incrementalDragRotation, lonLatToVec3 } from "@/lib/geo/spherical";
import { triangulateRings } from "@/lib/geo/triangulate";
import { orientationAtTime, type Plate, type Quat } from "@/lib/model/plate";
import { useStudioStore } from "@/lib/store/useStudioStore";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  Quaternion,
  Uint32BufferAttribute,
  Vector3,
} from "three";

const PLATE_RADIUS = 1.004; // slightly above the base globe so tiles read as separate pieces
const RADIUS_JITTER = 0.0006; // per-plate radius nudge so overlapping plates mid-reconstruction don't z-fight

// Small deterministic hash so the same plate always gets the same nudge.
function radiusJitter(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash >>> 0) / 0xffffffff) * RADIUS_JITTER;
}

function capturePointer(e: ThreeEvent<PointerEvent>) {
  (e.target as Element).setPointerCapture(e.pointerId);
}
function releasePointer(e: ThreeEvent<PointerEvent>) {
  (e.target as Element).releasePointerCapture?.(e.pointerId);
}

export function PlateMesh({ plate }: { plate: Plate }) {
  const meshRef = useRef<Mesh>(null!);
  // Accumulated rotation for the drag in progress; identity when not dragging.
  const dragQuatRef = useRef(new Quaternion());
  const lastDragPointRef = useRef<Vector3 | null>(null);

  const geometry = useMemo(() => {
    const { positions, normals, indices } = triangulateRings(
      plate.rings,
      PLATE_RADIUS + radiusJitter(plate.id),
    );
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geo.setIndex(new Uint32BufferAttribute(indices, 1));
    return geo;
  }, [plate.rings, plate.id]);

  useFrame(() => {
    const timeMa = useStudioStore.getState().timeMa;
    const base = orientationAtTime(plate, timeMa);
    meshRef.current.quaternion.copy(dragQuatRef.current).multiply(base);
  });

  const hoveredPlateId = useStudioStore((s) => s.hoveredPlateId);
  const selectedPlateId = useStudioStore((s) => s.selectedPlateId);
  const hoverPlate = useStudioStore((s) => s.hoverPlate);
  const selectPlate = useStudioStore((s) => s.selectPlate);
  const mode = useStudioStore((s) => s.mode);
  const sandboxTool = useStudioStore((s) => s.sandboxTool);

  const isHovered = hoveredPlateId === plate.id;
  const isSelected = selectedPlateId === plate.id;
  const isDragging = useStudioStore((s) => s.draggingPlateId) === plate.id;
  const showLabels = useStudioStore((s) => s.showLabels);

  const centroid = useMemo(() => {
    return plate.rings[0]
      .reduce((acc, [lon, lat]) => acc.add(lonLatToVec3(lon, lat)), new Vector3())
      .normalize()
      .multiplyScalar(PLATE_RADIUS);
  }, [plate.rings]);

  return (
    <mesh
      ref={meshRef}
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
        if (mode !== "sandbox") return;
        const { sandboxTool, beginDrag, beginFreehandCut } = useStudioStore.getState();
        if (sandboxTool === "drag") {
          e.stopPropagation();
          capturePointer(e);
          // Intersect the ray against the unit sphere directly (not the mesh
          // triangles) so this keeps working once pointer capture carries the
          // drag off this mesh's own geometry.
          const hit = raySphereIntersection(e.ray, 1);
          if (!hit) return;
          lastDragPointRef.current = hit;
          dragQuatRef.current.identity();
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
          const pole = dragRotateMode === "pole" && eulerPole ? new Vector3(...eulerPole) : undefined;
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
          endDrag();
        } else if (sandboxTool === "cut-freehand" && cuttingPlateId === plate.id) {
          e.stopPropagation();
          releasePointer(e);
          void endFreehandCut();
        }
      }}
      onClick={(e) => {
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
        color={plate.color}
        roughness={0.7}
        metalness={0}
        emissive={isSelected || isDragging ? "#ffffff" : isHovered ? "#888888" : "#000000"}
        emissiveIntensity={isSelected || isDragging ? 0.35 : isHovered ? 0.2 : 0}
        side={DoubleSide}
      />
      {showLabels && (
        <Html position={centroid} center distanceFactor={4} className="pointer-events-none">
          <div className="rounded bg-black/60 px-1 text-[9px] whitespace-nowrap text-white">
            {plate.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}
