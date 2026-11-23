// Regenerates test/vectors/payload-v1.json. Only run when intentionally adding vectors:
// existing vectors must never change (CI compares against the committed file).
import { writeFileSync } from "node:fs";
import { encodeBody, encodeFragment, stickerIdOf } from "../src/core/payload.ts";
import { FIXTURES } from "../src/core/testing/fixtures.ts";
import { VECTOR_APP_BASE } from "../src/core/testing/vectors.ts";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const vectors = await Promise.all(
  Object.entries(FIXTURES).map(async ([name, s]) => {
    const body = encodeBody(s);
    return {
      name,
      input: {
        paletteId: s.paletteId,
        transparentIndex: s.transparentIndex,
        snsKind: s.snsKind,
        snsId: s.snsId,
        pixels: hex(s.pixels).replace(/0(.)/g, "$1"),
      },
      bodyHex: hex(body),
      stickerId: await stickerIdOf(body),
      url: `${VECTOR_APP_BASE}#${encodeFragment(body)}`,
    };
  }),
);

writeFileSync(
  new URL("../test/vectors/payload-v1.json", import.meta.url),
  `${JSON.stringify({ version: 1, appBase: VECTOR_APP_BASE, vectors }, null, 2)}\n`,
);
console.log(`wrote ${vectors.length} vectors`);
