import type { CSSProperties } from "react";
import type { Light } from "../../core/daylight.ts";

// the light as CSS variables, for the room's layers and for whatever casts a shadow in it
export const lightStyle = (l: Light): CSSProperties =>
  ({
    "--sun": l.sun.toFixed(3),
    "--sun-x": l.sunX.toFixed(3),
    "--length": l.length.toFixed(3),
    "--warm": l.warm.toFixed(3),
    "--dim": l.dim.toFixed(3),
    "--lamp": l.lamp.toFixed(3),
  }) as CSSProperties;
