import { createContext, use } from "react";

export const CloseContext = createContext<() => void>(() => {});

export function useCloseDialog(): () => void {
  return use(CloseContext);
}
