import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  PALETTES,
  oklabDistanceSq,
  rgbToOklab,
  type Oklab,
  type Palette,
} from "../src/core/palette.ts";
import { quantize, rankPalettes, resizeTo32, type Rgba } from "../src/core/quantize.ts";
import { encodeRgba } from "../test/png.ts";

const N = 32;
const MONOCHROME = ["Grayscale", "Sepia", "Matcha", "Indigo", "Crimson"];
const BROWN_FAMILY = ["Sepia", "Desert", "Portrait", "Autumn", "Bakery", "Fire"];
const DARK_MEAN_L = 0.2;
const DUPLICATE_MEAN_DISTANCE = 0.05;
const FEATURELESS_SHARPNESS = 0.0035;
const FEW_COLORS = 24;

type Ranking = { readonly paletteId: number; readonly error: number }[];
type Criterion = { readonly name: string; readonly rank: (img: Rgba) => Ranking };
type Photo = {
  readonly file: string;
  readonly crop: Uint8Array;
  readonly small: Rgba;
  readonly lab: readonly Oklab[];
};

const [photoDir, outDir] = process.argv.slice(2);
if (!photoDir || !outDir)
  throw new Error("usage: node scripts/palette-eval.ts <photo-dir> <out-dir>");

const labOf = (img: Rgba): Oklab[] =>
  Array.from({ length: N * N }, (_, p) =>
    rgbToOklab([img.data[p * 4] ?? 0, img.data[p * 4 + 1] ?? 0, img.data[p * 4 + 2] ?? 0]),
  );

function boxBlur3(lab: readonly Oklab[]): Oklab[] {
  return lab.map((_, p) => {
    const x = p % N;
    const y = Math.floor(p / N);
    const sum: [number, number, number] = [0, 0, 0];
    let count = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c =
          lab[Math.min(N - 1, Math.max(0, y + dy)) * N + Math.min(N - 1, Math.max(0, x + dx))];
        if (!c) continue;
        sum[0] += c[0];
        sum[1] += c[1];
        sum[2] += c[2];
        count++;
      }
    return [sum[0] / count, sum[1] / count, sum[2] / count];
  });
}

function centerWeight(p: number): number {
  const reach = Math.max(Math.abs((p % N) - 15.5), Math.abs(Math.floor(p / N) - 15.5));
  return Math.min(1, Math.max(0.4, 1 - (0.6 * (reach - 8)) / 7.5));
}

function quantizedLab(img: Rgba, palette: Palette): Oklab[] {
  const { indices } = quantize(img, palette, null);
  return Array.from(indices, (k) => palette.oklab[k] ?? [0, 0, 0]);
}

function sortRanking(r: Ranking): Ranking {
  return r.toSorted((a, b) => a.error - b.error || a.paletteId - b.paletteId);
}

const errorSum = (
  a: readonly Oklab[],
  b: readonly Oklab[],
  weight: (p: number) => number,
): number => a.reduce((sum, c, p) => sum + weight(p) * oklabDistanceSq(c, b[p] ?? c), 0);

const CRITERIA: readonly Criterion[] = [
  {
    name: "baseline",
    rank: (img) =>
      rankPalettes(img).map((c) => ({ paletteId: c.paletteId, error: c.result.error })),
  },
  {
    name: "blur3",
    rank: (img) => {
      const source = boxBlur3(labOf(img));
      return sortRanking(
        PALETTES.map((p) => ({
          paletteId: p.id,
          error: errorSum(source, boxBlur3(quantizedLab(img, p)), () => 1),
        })),
      );
    },
  },
  {
    name: "center",
    rank: (img) => {
      const source = labOf(img);
      return sortRanking(
        PALETTES.map((p) => ({
          paletteId: p.id,
          error: errorSum(source, quantizedLab(img, p), centerWeight),
        })),
      );
    },
  },
];

async function loadPhoto(file: string): Promise<Photo> {
  const { data, info } = await sharp(join(photoDir ?? "", file))
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const src: Rgba = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const size = Math.min(info.width, info.height);
  const crop = {
    x: Math.floor((info.width - size) / 2),
    y: Math.floor((info.height - size) / 2),
    size,
  };
  const small = resizeTo32(src, crop, "area");
  const cropPng = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({ left: crop.x, top: crop.y, width: size, height: size })
    .resize(N * 4, N * 4, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return { file, crop: new Uint8Array(cropPng), small, lab: labOf(small) };
}

const meanLightness = (lab: readonly Oklab[]) => lab.reduce((s, c) => s + c[0], 0) / lab.length;

function sharpness(lab: readonly Oklab[]): number {
  const L = (x: number, y: number) => lab[y * N + x]?.[0] ?? 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      const v = L(x - 1, y) + L(x + 1, y) + L(x, y - 1) + L(x, y + 1) - 4 * L(x, y);
      sum += v;
      sumSq += v * v;
      count++;
    }
  return sumSq / count - (sum / count) ** 2;
}

const distinctColors = (img: Rgba): number =>
  new Set(Array.from({ length: N * N }, (_, p) => img.data.slice(p * 4, p * 4 + 3).join(","))).size;

const meanDistance = (a: readonly Oklab[], b: readonly Oklab[]): number =>
  a.reduce((s, c, p) => s + Math.sqrt(oklabDistanceSq(c, b[p] ?? c)), 0) / a.length;

function selectPhotos(all: readonly Photo[]): { kept: Photo[]; excluded: string[] } {
  const kept: Photo[] = [];
  const excluded: string[] = [];
  for (const photo of all) {
    const reason = (() => {
      if (meanLightness(photo.lab) < DARK_MEAN_L) return "almost black";
      if (distinctColors(photo.small) < FEW_COLORS) return "few colors (screenshot or document)";
      if (sharpness(photo.lab) < FEATURELESS_SHARPNESS) return "featureless (blurred or blank)";
      const twin = kept.find((k) => meanDistance(k.lab, photo.lab) < DUPLICATE_MEAN_DISTANCE);
      return twin ? `near-duplicate of ${twin.file}` : undefined;
    })();
    if (reason) excluded.push(`${photo.file}: ${reason}`);
    else kept.push(photo);
  }
  return { kept, excluded };
}

function contactSheet(photos: readonly Photo[], rankings: readonly Ranking[]): Uint8Array {
  const cell = N * 4;
  const gap = 4;
  const perRow = 4;
  const pairW = cell * 2 + gap;
  const width = perRow * (pairW + gap * 2);
  const rows = Math.ceil(photos.length / perRow);
  const height = rows * (cell + gap);
  const out = new Uint8Array(width * height * 4).fill(255);
  const blit = (src: Uint8Array | Uint8ClampedArray, ox: number, oy: number) => {
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++)
        out.set(
          src.subarray((y * cell + x) * 4, (y * cell + x) * 4 + 4),
          ((oy + y) * width + ox + x) * 4,
        );
  };
  photos.forEach((photo, i) => {
    const ox = (i % perRow) * (pairW + gap * 2) + gap;
    const oy = Math.floor(i / perRow) * (cell + gap);
    const palette = PALETTES[rankings[i]?.[0]?.paletteId ?? 0];
    if (!palette) return;
    const scaled = new Uint8Array(cell * cell * 4);
    const { indices } = quantize(photo.small, palette, null);
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const rgb = palette.rgb[indices[(y >> 2) * N + (x >> 2)] ?? 0] ?? [0, 0, 0];
        scaled.set([rgb[0], rgb[1], rgb[2], 255], (y * cell + x) * 4);
      }
    blit(photo.crop, ox, oy);
    blit(scaled, ox + cell + gap, oy);
  });
  return encodeRgba(width, height, out);
}

const nameOf = (id: number) => PALETTES[id]?.name ?? String(id);
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (n: number, total: number) => `${((100 * n) / total).toFixed(1)}%`;

function summaryCsv(photos: readonly Photo[], all: readonly (readonly Ranking[])[]): string {
  const rows = ["photo,criterion,top1,error,top3"];
  photos.forEach((photo, i) =>
    CRITERIA.forEach((c, k) => {
      const r = all[k]?.[i] ?? [];
      const top3 = r
        .slice(0, 3)
        .map((x) => nameOf(x.paletteId))
        .join("|");
      rows.push(
        `${photo.file},${c.name},${nameOf(r[0]?.paletteId ?? 0)},${(r[0]?.error ?? 0).toFixed(4)},${top3}`,
      );
    }),
  );
  return rows.join("\n") + "\n";
}

function choiceCounts(rankings: readonly Ranking[]): Map<string, number> {
  const counts = new Map<string, number>(PALETTES.map((p) => [p.name, 0]));
  for (const r of rankings) {
    const name = nameOf(r[0]?.paletteId ?? 0);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function histogramMd(total: number, all: readonly (readonly Ranking[])[]): string {
  const sections = CRITERIA.map((c, k) => {
    const counts = choiceCounts(all[k] ?? []);
    const mono = MONOCHROME.reduce((s, n) => s + (counts.get(n) ?? 0), 0);
    const never = [...counts].filter(([, n]) => n === 0).map(([name]) => name);
    const lines = [...counts]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(
        ([name, n]) =>
          `| ${MONOCHROME.includes(name) ? "**" + name + "**" : name} | ${n} | ${pct(n, total)} |`,
      );
    return [
      `## ${c.name}`,
      "",
      `- monochrome (${MONOCHROME.join(", ")}): ${mono} / ${total} (${pct(mono, total)})`,
      `- never chosen (${never.length}): ${never.join(", ") || "-"}`,
      `- mean top-1 error: ${mean((all[k] ?? []).map((r) => r[0]?.error ?? 0)).toFixed(4)}`,
      "",
      "| palette | photos | share |",
      "| --- | ---: | ---: |",
      ...lines,
    ].join("\n");
  });
  return `# Palette choice histogram (${total} photos)\n\n${sections.join("\n\n")}\n`;
}

function directedDistance(a: Palette, b: Palette): number {
  return mean(
    a.oklab.map((c) => Math.sqrt(Math.min(...b.oklab.map((d) => oklabDistanceSq(c, d))))),
  );
}

function similarityMd(): string {
  const pairs = PALETTES.flatMap((a, i) =>
    PALETTES.slice(i + 1).map((b) => ({
      a: a.name,
      b: b.name,
      d: (directedDistance(a, b) + directedDistance(b, a)) / 2,
    })),
  ).toSorted((x, y) => x.d - y.d);
  const row = (p: { a: string; b: string; d: number }) => `| ${p.a} | ${p.b} | ${p.d.toFixed(4)} |`;
  const brown = pairs.filter((p) => BROWN_FAMILY.includes(p.a) && BROWN_FAMILY.includes(p.b));
  const header = ["| palette A | palette B | distance |", "| --- | --- | ---: |"];
  return [
    "# Palette similarity (mean nearest-colour OKLab distance, both directions)",
    "",
    "## 10 closest pairs",
    "",
    ...header,
    ...pairs.slice(0, 10).map(row),
    "",
    `## Brown family (${BROWN_FAMILY.join(", ")})`,
    "",
    ...header,
    ...brown.map(row),
    "",
  ].join("\n");
}

const files = readdirSync(photoDir)
  .filter((f) => /\.jpe?g$/i.test(f))
  .toSorted();
const photos = await Promise.all(files.map(loadPhoto));
const { kept, excluded } = selectPhotos(photos);
const all = CRITERIA.map((c) => kept.map((p) => c.rank(p.small)));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "summary.csv"), summaryCsv(kept, all));
writeFileSync(join(outDir, "choice-histogram.md"), histogramMd(kept.length, all));
writeFileSync(join(outDir, "palette-similarity.md"), similarityMd());
CRITERIA.forEach((c, k) =>
  writeFileSync(join(outDir, `contact-sheet-${c.name}.png`), contactSheet(kept, all[k] ?? [])),
);

console.log(`photos: ${files.length} found, ${kept.length} used, ${excluded.length} excluded`);
for (const line of excluded) console.log(`  excluded ${line}`);
CRITERIA.forEach((c, k) => {
  const counts = choiceCounts(all[k] ?? []);
  const mono = MONOCHROME.reduce((s, n) => s + (counts.get(n) ?? 0), 0);
  const never = [...counts].filter(([, n]) => n === 0).length;
  const err = mean((all[k] ?? []).map((r) => r[0]?.error ?? 0));
  console.log(
    `${c.name}: monochrome ${pct(mono, kept.length)}, never chosen ${never}, mean error ${err.toFixed(4)}`,
  );
});
