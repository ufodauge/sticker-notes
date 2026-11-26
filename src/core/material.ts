// What a sticker is made of. The maker chooses it, and it travels with the sticker in the payload
// (one byte after the pixels; "matte" adds no byte, so plain stickers keep their bytes and ID).
// A material becomes available once the maker has exchanged with enough people.
export const MATERIALS = {
  matte: { code: 0, people: 0 },
  holo: { code: 1, people: 0 },
  puffy: { code: 2, people: 1 },
  glitter: { code: 3, people: 2 },
  clear: { code: 4, people: 3 },
  foil: { code: 5, people: 5 },
} as const satisfies Record<string, { readonly code: number; readonly people: number }>;

export type MaterialKind = keyof typeof MATERIALS;
export const MATERIAL_KINDS = Object.keys(MATERIALS) as readonly MaterialKind[];

// tone: the palette index that turns to metal (foil only; 0 for every other material)
export type Material = { readonly kind: MaterialKind; readonly tone: number };

export function materialOfCode(code: number): MaterialKind | undefined {
  return MATERIAL_KINDS.find((k) => MATERIALS[k].code === code);
}

// How many more people it takes to unlock the material (0 when it is already available).
export function peopleToUnlock(kind: MaterialKind, people: number): number {
  return Math.max(0, MATERIALS[kind].people - people);
}
