import { GLOBE_RADIUS } from "@/lib/geo/spherical";

export function Globe() {
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <meshStandardMaterial color="#0f2a4a" roughness={0.9} metalness={0} />
    </mesh>
  );
}
