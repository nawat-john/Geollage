import type { Camera, Vector3 } from "three";

interface OrbitControlsLike {
  target: Vector3;
}

/**
 * A tiny module-level registry so non-R3F code (export, save/load) can read
 * the current camera pose without threading it through React context or
 * Zustand — the camera/controls objects are mutated in place by three.js
 * every frame, so a snapshot on demand is all export needs.
 */
let camera: Camera | null = null;
let controls: OrbitControlsLike | null = null;

export function registerCamera(c: Camera | null): void {
  camera = c;
}

export function registerControls(c: OrbitControlsLike | null): void {
  controls = c;
}

export function snapshotCamera(): { position: [number, number, number]; target: [number, number, number]; zoom: number } {
  const position: [number, number, number] = camera
    ? [camera.position.x, camera.position.y, camera.position.z]
    : [0, 0, 2.8];
  const target: [number, number, number] = controls
    ? [controls.target.x, controls.target.y, controls.target.z]
    : [0, 0, 0];
  const zoom = camera && "zoom" in camera ? (camera as unknown as { zoom: number }).zoom : 1;
  return { position, target, zoom };
}
