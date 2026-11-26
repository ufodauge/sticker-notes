export const hashStore = {
  // opens a sticker link in place, as if it had been followed (the inbox takes it from here)
  open: (fragment: string): void => {
    window.location.hash = fragment;
  },
  clear: (ifHash?: string): void => {
    if (ifHash !== undefined && window.location.hash !== ifHash) return;
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
  },
};
