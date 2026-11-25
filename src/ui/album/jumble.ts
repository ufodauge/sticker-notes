// A stable, untidy angle or offset per sticker: the same sticker always lies the same way.
export function jumble(id: string, spread: number, at = 6): number {
  return ((Number.parseInt(id.slice(at, at + 2), 16) || 0) / 255 - 0.5) * spread;
}
