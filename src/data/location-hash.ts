export const hashStore = {
  clear: (ifHash?: string): void => {
    if (ifHash !== undefined && window.location.hash !== ifHash) return;
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
  },
};
