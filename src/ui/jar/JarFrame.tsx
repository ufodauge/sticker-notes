import type { ReactNode } from "react";
import { t } from "../messages.ts";
import styles from "./Jar.module.css";

type Props = { readonly tools?: ReactNode; readonly children?: ReactNode };

// The empty jar outline: the loading state of the lazy chunk and the frame of the live jar.
export function JarFrame({ tools, children }: Props) {
  return (
    <section className={styles.stage} aria-label={t.jar.label}>
      {tools}
      <div className={children ? styles.jar : `${styles.jar} ${styles.jarEmpty}`}>{children}</div>
    </section>
  );
}
