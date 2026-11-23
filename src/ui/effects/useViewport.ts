import { useSyncExternalStore } from "react";

export type Viewport = { readonly width: number; readonly height: number; readonly dpr: number };

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};

// cache so getSnapshot returns a stable object between unchanged reads
const cache: {
  key: string;
  value: Viewport;
} = {
  key: "",
  value: {
    width: 0,
    height: 0,
    dpr: 1,
  },
};

const getSnapshot = (): Viewport => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const key = `${width}x${height}@${dpr}`;
  if (key !== cache.key) {
    cache.key = key;
    cache.value = { width, height, dpr };
  }
  return cache.value;
};

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot);
}
