// One scene unit is 3.3 cm: the jar is 17 cm tall, a block 4.1 cm across and 1.2 cm thick.
const METRES_PER_UNIT = 0.033;
const perCubicUnit = (kgPerCubicMetre: number) => kgPerCubicMetre * METRES_PER_UNIT ** 3;

export const PHYSICS3D = {
  // a little lighter than real: at true g the blocks felt too heavy on a phone
  gravity: (9.81 * 0.72) / METRES_PER_UNIT,
  acrylicDensity: perCubicUnit(1180),
  glassDensity: perCubicUnit(2500),
  // per-material values combined as a product's square root (Jolt) or a mean (rapier), giving
  // acrylic/acrylic 0.5, acrylic/glass ~0.4, acrylic/wood 0.5, glass/wood ~0.4
  friction: { acrylic: 0.5, glass: 0.32, wood: 0.5 },
  restitution: { acrylic: 0.1, glass: 0.1, wood: 0.1 },
  // real speeds are sqrt(g ratio) times the old toy speeds; a metre per second is 30 units/s
  speedScale: Math.sqrt(9.81 / METRES_PER_UNIT / 20),
} as const;

export const JAR3D = {
  side: 1.25,
  thickness: 0.36,
  outerRadius: 2.45,
  neckRadius: 1.95,
  wall: 0.14,
  baseThickness: 0.28,
  bodyHeight: 3.6,
  shoulderHeight: 4.5,
  height: 5.2,
  cornerRadius: 0.5,
  lipOut: 0.1,
  deskThickness: 0.6,
  viewWidth: 6.8,
  elevationDeg: 19,
  target: [0, 2.3, 0] as const,
  vfovDeg: 30,
} as const;

export type Profile = readonly (readonly [r: number, y: number])[];

const CORNER_STEPS = 8;
const SHOULDER_STEPS = 10;

const arc = (cx: number, cy: number, radius: number, from: number, to: number, steps: number) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  });

const smooth = (t: number) => t * t * (3 - 2 * t);

export function outerProfile(): Profile {
  const { outerRadius, neckRadius, bodyHeight, shoulderHeight, height, cornerRadius, lipOut } =
    JAR3D;
  const corner = arc(
    outerRadius - cornerRadius,
    cornerRadius,
    cornerRadius,
    -Math.PI / 2,
    0,
    CORNER_STEPS,
  );
  const shoulder = Array.from({ length: SHOULDER_STEPS + 1 }, (_, i) => {
    const t = i / SHOULDER_STEPS;
    return [
      outerRadius + (neckRadius - outerRadius) * smooth(t),
      bodyHeight + (shoulderHeight - bodyHeight) * t,
    ] as const;
  });
  return [[0, 0], ...corner, ...shoulder, [neckRadius, height], [neckRadius + lipOut, height]];
}

export function innerProfile(): Profile {
  const { wall, baseThickness, height, neckRadius, lipOut } = JAR3D;
  const outer = outerProfile();
  const body = outer
    .slice(1, -1)
    .map(
      ([r, y]) =>
        [Math.max(0, r - wall), Math.max(baseThickness, y + (y < 1 ? baseThickness : 0))] as const,
    )
    .filter(([r]) => r > 0);
  return [
    [neckRadius + lipOut - wall * 0.4, height],
    [neckRadius - wall, height],
    ...body.slice().reverse(),
    [0, baseThickness],
  ];
}

const cameraDistance = (aspect: number): number => {
  const vfov = (JAR3D.vfovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const forWidth = JAR3D.viewWidth / 2 / Math.tan(hfov / 2);
  const forHeight = (JAR3D.height + 2.4) / 2 / Math.tan(vfov / 2);
  return Math.max(forWidth, forHeight);
};

export const cameraPosition = (aspect: number, yaw: number): readonly [number, number, number] => {
  const d = cameraDistance(aspect);
  const el = (JAR3D.elevationDeg * Math.PI) / 180;
  const [tx, ty, tz] = JAR3D.target;
  const flat = d * Math.cos(el);
  return [tx + flat * Math.sin(yaw), ty + d * Math.sin(el), tz + flat * Math.cos(yaw)];
};

export const spawnPose = (
  index: number,
  r: readonly [number, number, number, number],
  dropY: number = JAR3D.height + 1.4,
): { x: number; y: number; z: number; rx: number; ry: number; rz: number } => {
  const spread = JAR3D.neckRadius * 0.45;
  return {
    x: (r[0] - 0.5) * 2 * spread,
    y: dropY + (index % 3) * 0.2,
    z: (r[1] - 0.5) * 2 * spread,
    rx: (r[2] - 0.5) * 2.4,
    ry: r[3] * Math.PI * 2,
    rz: (r[2] + r[3]) * 3,
  };
};

const WALL_BANDS: readonly number[] = [0, 0.5, 1.6, 2.8, 3.6, 4.05, 4.5, JAR3D.height];
const WALL_SEGMENTS = 20;
// the grabbed jar's wall pieces are thicker than the glass, outward only: a block shoved against a
// moving wall then has far more than one step's travel of solid to cross
const PIECE_OUTSET = 0.5;

export const outerRadiusAt = (y: number): number => {
  const profile = outerProfile();
  const upper = profile.findIndex(([, py]) => py >= y);
  if (upper <= 0) return profile[0]?.[0] ?? 0;
  const [r1, y1] = profile[upper] ?? [0, 0];
  const [r0, y0] = profile[upper - 1] ?? [0, 0];
  return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
};

type Triples = number[];

const ring = (radius: number, y: number, a0: number, a1: number): Triples => [
  radius * Math.cos(a0),
  y,
  radius * Math.sin(a0),
  radius * Math.cos(a1),
  y,
  radius * Math.sin(a1),
];

export function jarCollisionPieces(): readonly Float32Array[] {
  const base = Array.from({ length: WALL_SEGMENTS }, (_, k) => {
    const a = (k / WALL_SEGMENTS) * Math.PI * 2;
    const r = outerRadiusAt(JAR3D.baseThickness) - 0.05;
    return [
      r * Math.cos(a),
      0,
      r * Math.sin(a),
      r * Math.cos(a),
      JAR3D.baseThickness,
      r * Math.sin(a),
    ];
  }).flat();
  const walls = WALL_BANDS.slice(0, -1).flatMap((y0, j) => {
    const y1 = WALL_BANDS[j + 1] ?? y0;
    const outer0 = outerRadiusAt(y0);
    const outer1 = outerRadiusAt(y1);
    return Array.from({ length: WALL_SEGMENTS }, (_, k) => {
      const a0 = (k / WALL_SEGMENTS) * Math.PI * 2;
      const a1 = ((k + 1) / WALL_SEGMENTS) * Math.PI * 2;
      return Float32Array.from([
        ...ring(outer0 + PIECE_OUTSET, y0, a0, a1),
        ...ring(outer1 + PIECE_OUTSET, y1, a0, a1),
        ...ring(Math.max(0.1, outer0 - JAR3D.wall), y0, a0, a1),
        ...ring(Math.max(0.1, outer1 - JAR3D.wall), y1, a0, a1),
      ]);
    });
  });
  return [Float32Array.from(base), ...walls];
}

const RAD = Math.PI / 180;

export function gravityFromOrientation(
  betaDeg: number,
  gammaDeg: number,
  screenAngleDeg: number,
): readonly [number, number, number] {
  const b = betaDeg * RAD;
  const g = gammaDeg * RAD;
  const a = screenAngleDeg * RAD;
  const dx = Math.sin(g) * Math.cos(b);
  const dy = -Math.sin(b);
  const dz = -Math.cos(g) * Math.cos(b);
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a), dz];
}

type Vec3 = readonly [number, number, number];

// Gravity relative to how the phone was held when tilt was switched on: that pose counts as
// upright, and only the change since then tips the jar.
export function downFromBase(base: Vec3, now: Vec3): Vec3 {
  const [ax, ay, az] = base;
  const [bx, by, bz] = [0, -1, 0];
  const c = ax * bx + ay * by + az * bz;
  const [x, y, z] = now;
  if (c < -0.9999) return [-x, -y, z];
  const v: Vec3 = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const cross: Vec3 = [v[1] * z - v[2] * y, v[2] * x - v[0] * z, v[0] * y - v[1] * x];
  const k = (v[0] * x + v[1] * y + v[2] * z) / (1 + c);
  return [x * c + cross[0] + v[0] * k, y * c + cross[1] + v[1] * k, z * c + cross[2] + v[2] * k];
}
