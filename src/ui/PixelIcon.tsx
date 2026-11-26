import styles from "./PixelIcon.module.css";

// The toolbar's icons, drawn as little pixel-art stickers lying on the desk: each a 16×16 picture
// with the white die-cut border a sticker has, and its shadow (in the CSS). Letters in the
// picture name its colours; "." is clear.

const INK: Readonly<Record<string, string>> = {
  k: "#2b2a33",
  w: "#ffffff",
  g: "#5fae6b",
  y: "#f4c04b",
  r: "#e2574c",
  b: "#5b8fd6",
  s: "#c9ccd3",
  p: "#f2a7c3",
};

// a 16×16 picture, one row a line
const ICONS = {
  create: [
    "................",
    ".kkkkkkkkkkk....",
    ".kbbbbbbbbbk....",
    ".kbyybbbbbbk....",
    ".kbyybbbbbbk....",
    ".kbbbbbbbgbk....",
    ".kbbbbbbgggk....",
    ".kbbbgbgggg.....",
    ".kbbggggggg.rr..",
    ".kbggggggg..rr..",
    ".kkkkkkkk.rrrrrr",
    "..........rrrrrr",
    "............rr..",
    "............rr..",
    "................",
    "................",
  ],
  print: [
    "................",
    "....kkkkkkkk....",
    "....kwwwwwwk....",
    "....kwwwwwwk....",
    "..kkkkkkkkkkkk..",
    ".kssssssssssssk.",
    ".kssssssssssgsk.",
    ".kssssssssssssk.",
    ".kkkkkkkkkkkkkk.",
    "...kwwwwwwwwk...",
    "...kwkkkkkkwk...",
    "...kwwwwwwwwk...",
    "...kwkkkkwwwk...",
    "...kkkkkkkkkk...",
    "................",
    "................",
  ],
  menu: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..kkk..kkk..kkk.",
    "..kpk..kyk..kbk.",
    "..kkk..kkk..kkk.",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  debug: [
    "................",
    "...k........k...",
    "....k..kk..k....",
    ".....kkkkkk.....",
    "....kggggggk....",
    ".k.kggkggkggk.k.",
    "..kkggggggggkk..",
    "....kggggggk....",
    ".kkkkgkggkgkkkk.",
    "....kggggggk....",
    "..kkggkggkggkk..",
    ".k..kggggggk..k.",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

const SIZE = 16;

// the pixels of a picture, and the border round them (every clear pixel touching one)
function cells(rows: readonly string[]) {
  const at = (x: number, y: number) => rows[y]?.[x] ?? ".";
  const all = Array.from({ length: (SIZE + 2) ** 2 }, (_, i) => ({
    x: (i % (SIZE + 2)) - 1,
    y: Math.floor(i / (SIZE + 2)) - 1,
  }));
  const near = (x: number, y: number) =>
    [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => at(x + dx, y + dy) !== "."));
  return {
    painted: all.filter(({ x, y }) => at(x, y) !== ".").map((p) => ({ ...p, c: at(p.x, p.y) })),
    border: all.filter(({ x, y }) => at(x, y) === "." && near(x, y)),
  };
}

const drawn = new Map<IconName, ReturnType<typeof cells>>();

export function PixelIcon({ name }: { readonly name: IconName }) {
  const known = drawn.get(name);
  const { painted, border } = known ?? cells(ICONS[name]);
  if (!known) drawn.set(name, { painted, border });
  return (
    <svg
      className={styles.icon}
      viewBox="-1 -1 18 18"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {border.map(({ x, y }) => (
        <rect key={`b${x}.${y}`} x={x} y={y} width="1" height="1" fill="#ffffff" />
      ))}
      {painted.map(({ x, y, c }) => (
        <rect key={`p${x}.${y}`} x={x} y={y} width="1" height="1" fill={INK[c] ?? "#000"} />
      ))}
    </svg>
  );
}
