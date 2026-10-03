import { GLOBE_RADIUS, lonLatToVec3 } from "@/lib/geo/spherical";
import { Stars } from "@react-three/drei";
import { useMemo } from "react";
import { AdditiveBlending, BackSide, Float32BufferAttribute, BufferGeometry, Vector3 } from "three";

const GRATICULE_RADIUS = 1.012; // above plates and land, so it reads as a map grid
const GRATICULE_STEP_DEG = 30;

// Classic back-face rim glow: brightest where the shell's normal is
// perpendicular to the view direction, i.e. at the globe's silhouette.
const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(max(0.0, 0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * intensity;
  }
`;

function graticuleGeometry(): BufferGeometry {
  const positions: number[] = [];
  const push = (a: Vector3, b: Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lon = -180; lon < 180; lon += GRATICULE_STEP_DEG) {
    for (let lat = -80; lat < 80; lat += 2) {
      push(lonLatToVec3(lon, lat, GRATICULE_RADIUS), lonLatToVec3(lon, lat + 2, GRATICULE_RADIUS));
    }
  }
  for (let lat = -60; lat <= 60; lat += GRATICULE_STEP_DEG) {
    for (let lon = -180; lon < 180; lon += 2) {
      push(lonLatToVec3(lon, lat, GRATICULE_RADIUS), lonLatToVec3(lon + 2, lat, GRATICULE_RADIUS));
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

export function Globe() {
  const graticule = useMemo(() => graticuleGeometry(), []);
  return (
    <>
      <Stars radius={60} depth={40} count={3500} factor={3} saturation={0} fade speed={0.3} />
      <mesh renderOrder={-1}>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
        <meshStandardMaterial color="#0a2747" roughness={0.55} metalness={0.1} />
      </mesh>
      <lineSegments geometry={graticule} raycast={() => null}>
        <lineBasicMaterial color="#9cc8ff" transparent opacity={0.09} depthWrite={false} />
      </lineSegments>
      <mesh scale={1.16} raycast={() => null}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
