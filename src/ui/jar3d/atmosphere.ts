import * as THREE from "three";

const DUST_COUNT = 150;
const BEAM_HEIGHT = 15;
const BEAM_TOP_RADIUS = 0.18;
const BEAM_FLOOR_RADIUS = 4.2;

const coneRadiusAt = (y: number) =>
  BEAM_FLOOR_RADIUS + (BEAM_TOP_RADIUS - BEAM_FLOOR_RADIUS) * (y / BEAM_HEIGHT);

function seeded(seed: number): () => number {
  const state = { s: seed >>> 0 };
  return () => {
    state.s = (state.s + 0x6d2b79f5) >>> 0;
    const t = Math.imul(state.s ^ (state.s >>> 15), 1 | state.s);
    const u = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((u ^ (u >>> 14)) >>> 0) / 4294967296;
  };
}

function beam(origin: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    BEAM_TOP_RADIUS,
    BEAM_FLOOR_RADIUS,
    BEAM_HEIGHT,
    64,
    1,
    true,
  );
  geometry.translate(0, BEAM_HEIGHT / 2, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0.13 }, colour: { value: new THREE.Color(0xffdfae) } },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying float vFacing;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 toEye = normalize(cameraPosition - world.xyz);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vFacing = abs(dot(n, toEye));
        vHeight = uv.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float strength;
      uniform vec3 colour;
      varying float vHeight;
      varying float vFacing;
      void main() {
        float body = pow(vFacing, 4.0);
        float fall = mix(0.25, 1.0, vHeight) * smoothstep(0.0, 0.12, vHeight);
        gl_FragColor = vec4(colour * body * fall * strength, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(origin.x, 0, origin.z);
  mesh.renderOrder = 20;
  return mesh;
}

function dust(origin: THREE.Vector3): { points: THREE.Points; time: { value: number } } {
  const random = seeded(7);
  const positions = new Float32Array(DUST_COUNT * 3);
  const seeds = new Float32Array(DUST_COUNT);
  Array.from({ length: DUST_COUNT }).forEach((_, i) => {
    const y = 0.4 + random() * 9;
    const r = Math.sqrt(random()) * coneRadiusAt(y) * 0.85;
    const a = random() * Math.PI * 2;
    positions.set([origin.x + r * Math.cos(a), y, origin.z + r * Math.sin(a)], i * 3);
    seeds[i] = random();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time,
      pixelRatio: { value: 1 },
      colour: { value: new THREE.Color(0xffe8c4) },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float time;
      uniform float pixelRatio;
      varying float vAlpha;
      void main() {
        float s = seed * 6.2831;
        float speed = 0.06 + seed * 0.08;
        vec3 p = position + vec3(
          sin(time * speed + s) * 0.35,
          sin(time * speed * 0.6 + s * 1.7) * 0.25,
          cos(time * speed * 0.8 + s * 2.3) * 0.35);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float twinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(time * (0.5 + seed) + s * 3.0), 3.0);
        vAlpha = twinkle;
        gl_PointSize = (1.2 + seed * 2.0) * pixelRatio * (30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * 0.55;
        gl_FragColor = vec4(colour * a, 1.0);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 21;
  points.frustumCulled = false;
  return { points, time };
}

export type Atmosphere = {
  readonly group: THREE.Group;
  readonly time: { value: number };
  readonly setPixelRatio: (ratio: number) => void;
};

export function buildAtmosphere(lamp: THREE.Vector3): Atmosphere {
  const group = new THREE.Group();
  const d = dust(lamp);
  group.add(beam(lamp), d.points);
  const material = d.points.material as THREE.ShaderMaterial;
  return {
    group,
    time: d.time,
    setPixelRatio: (ratio) => {
      const uniform = material.uniforms["pixelRatio"];
      if (uniform) uniform.value = ratio;
    },
  };
}
