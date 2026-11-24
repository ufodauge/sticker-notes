export const JAR3D = {
  side: 1.25,
  thickness: 0.36,
  gravity: 26,
  outerRadius: 2.45,
  neckRadius: 1.95,
  wall: 0.14,
  baseThickness: 0.28,
  bodyHeight: 3.6,
  shoulderHeight: 4.5,
  height: 5.2,
  cornerRadius: 0.5,
  lipOut: 0.1,
  deskHalfWidth: 16,
  deskHalfDepth: 9,
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
): { x: number; y: number; z: number; rx: number; ry: number; rz: number } => {
  const spread = JAR3D.neckRadius * 0.45;
  return {
    x: (r[0] - 0.5) * 2 * spread,
    y: JAR3D.height + 1.4 + (index % 3) * 0.2,
    z: (r[1] - 0.5) * 2 * spread,
    rx: (r[2] - 0.5) * 2.4,
    ry: r[3] * Math.PI * 2,
    rz: (r[2] + r[3]) * 3,
  };
};
