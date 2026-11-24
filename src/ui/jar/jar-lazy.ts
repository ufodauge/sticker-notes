import { lazy } from "react";

export const loadJar = () => import("./Jar.tsx");

export const JarView = lazy(() => loadJar().then((m) => ({ default: m.Jar })));
