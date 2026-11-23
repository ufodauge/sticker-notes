import type { Rgba } from "../core/quantize.ts";

const MAX_SOURCE_SIDE = 1024;

export type LoadedImage = {
  readonly rgba: Rgba;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
};

type Drawable = {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly release: () => void;
};

async function decode(file: Blob): Promise<Drawable> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

export async function loadImageFile(file: Blob, signal?: AbortSignal): Promise<LoadedImage> {
  const img = await decode(file);
  if (signal?.aborted) {
    img.release();
    throw signal.reason;
  }
  try {
    const naturalWidth = img.width;
    const naturalHeight = img.height;
    if (naturalWidth === 0 || naturalHeight === 0) throw new Error("empty image");
    const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    return { rgba: { width, height, data }, naturalWidth, naturalHeight };
  } finally {
    img.release();
  }
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function rgbaToPng(img: {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
}
