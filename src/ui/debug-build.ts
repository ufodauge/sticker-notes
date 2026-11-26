// Whether this build carries the debug menu at all: the dev server does, and so does a build made
// with VITE_DEBUG=1 (the e2e tests use one). A plain production build leaves it out entirely: the
// constant is folded at build time and the menu's code is dropped with it.
export const DEBUG_BUILD: boolean = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "1";
