type InstallEvent = Event & {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
};

const state: { event: InstallEvent | null } = { event: null };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  state.event = e as InstallEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  state.event = null;
  notify();
});

export const installPrompt = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  canInstall: (): boolean => state.event !== null,
  async install(): Promise<void> {
    const e = state.event;
    if (!e) return;
    state.event = null;
    notify();
    await e.prompt();
    await e.userChoice;
  },
};
