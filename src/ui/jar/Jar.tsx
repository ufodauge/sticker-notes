import {
  Cylinder,
  ListChecks,
  RotateCcw,
  Shuffle,
  Smartphone,
  Vibrate,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useReducer, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { dustMotes, type Mote } from "../../core/jar-light.ts";
import { JAR_DEFAULT_COUNT } from "../../core/jar-selection.ts";
import { snsDisplay } from "../../core/sns.ts";
import { stickerStore } from "../../data/sticker-store.ts";
import common from "../common.module.css";
import { t } from "../messages.ts";
import { blockSelection } from "./block-selection.ts";
import { askTilt, reducedMotion, tiltAvailable, webgl2Available } from "./device.ts";
import { createJar3d } from "../jar3d/engine3d.ts";
import { createJar, type JarHandle } from "./engine.ts";
import styles from "./Jar.module.css";
import { currentShown, jarContent, shownStickers, soundPref } from "./jar-prefs.ts";
import { JarFrame } from "./JarFrame.tsx";
import { publishStress } from "./probe.ts";

type Props = { readonly onPick: () => void };

const MOTES = dustMotes(12);

const USE_3D = webgl2Available() && !location.search.includes("jar=2d");

const moteStyle = (m: Mote): CSSProperties =>
  ({
    "--x": m.x,
    "--y": m.y,
    "--size": m.size,
    "--dx": m.dx,
    "--dy": m.dy,
    "--seconds": m.seconds,
    "--delay": m.delay,
  }) as CSSProperties;

export function Jar({ onPick }: Props) {
  const reduced = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get);
  const snap = useSyncExternalStore(stickerStore.subscribe, stickerStore.getSnapshot);
  const selection = useSyncExternalStore(jarContent.subscribe, jarContent.get);
  const soundOn = useSyncExternalStore(soundPref.subscribe, soundPref.get);
  const handle = useRef<
    (JarHandle & { reset?: () => void; setLid?: (on: boolean) => void }) | null
  >(null);
  const [lidOn, setLidOn] = useReducer((_: boolean, next: boolean) => next, false);
  const backGlass = useRef<HTMLCanvasElement>(null);
  const frontGlass = useRef<HTMLCanvasElement>(null);
  const [tilting, setTilting] = useReducer((_: boolean, next: boolean) => next, false);
  const all = snap.status === "ready" ? snap.stickers : [];
  const shown = shownStickers(all, selection);

  // The canvas is driven by external stores (stickers, jar content, tapped block), subscribed here
  // and released together with the canvas.
  const attach = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const sync = () => handle.current?.setBlocks(currentShown());
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      const glass = { back: backGlass.current, front: frontGlass.current };
      if (!box || box.width <= 0 || box.height <= 0) return;
      if (handle.current) {
        handle.current.resize(box.width, box.height);
        return;
      }
      const common3 = {
        canvas,
        width: box.width,
        height: box.height,
        blocks: currentShown(),
        still: reduced,
        selected: blockSelection.get,
        onSelect: blockSelection.set,
      };
      if (USE_3D) {
        handle.current = createJar3d(common3);
        return;
      }
      if (!glass.back || !glass.front) return;
      handle.current = createJar({ ...common3, glass: { back: glass.back, front: glass.front } });
    });
    const release = [
      stickerStore.subscribe(sync),
      jarContent.subscribe(sync),
      blockSelection.subscribe(() => handle.current?.repaint()),
    ];
    if (import.meta.env.VITE_JAR_PROBE) {
      publishStress(() => {
        const snapshot = stickerStore.getSnapshot();
        if (snapshot.status === "ready") handle.current?.setBlocks(snapshot.stickers);
      });
    }
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      release.forEach((r) => r());
      handle.current?.dispose();
      handle.current = null;
      blockSelection.set(null);
      setTilting(false);
      setLidOn(false);
    };
  };

  const toggleTilt = async () => {
    const on = !tilting && (await askTilt());
    handle.current?.setTilt(on);
    setTilting(on);
  };

  const tools = (
    <div className={styles.tools}>
      {!reduced && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.jar.shake}
          title={t.jar.shake}
          onClick={() => handle.current?.shake()}
        >
          <Vibrate aria-hidden="true" size={22} strokeWidth={1.5} />
        </button>
      )}
      {!reduced && USE_3D && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.jar.lid}
          title={t.jar.lid}
          aria-pressed={lidOn}
          onClick={() => {
            handle.current?.setLid?.(!lidOn);
            setLidOn(!lidOn);
          }}
        >
          <Cylinder aria-hidden="true" size={22} strokeWidth={1.5} />
        </button>
      )}
      {!reduced && USE_3D && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.jar.reset}
          title={t.jar.reset}
          onClick={() => handle.current?.reset?.()}
        >
          <RotateCcw aria-hidden="true" size={22} strokeWidth={1.5} />
        </button>
      )}
      {!reduced && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.jar.sound}
          title={t.jar.sound}
          aria-pressed={soundOn}
          onClick={() => soundPref.set(!soundOn)}
        >
          {soundOn ? (
            <Volume2 aria-hidden="true" size={22} strokeWidth={1.5} />
          ) : (
            <VolumeOff aria-hidden="true" size={22} strokeWidth={1.5} />
          )}
        </button>
      )}
      {!reduced && tiltAvailable() && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.jar.tilt}
          title={t.jar.tilt}
          aria-pressed={tilting}
          onClick={() => void toggleTilt()}
        >
          <Smartphone aria-hidden="true" size={22} strokeWidth={1.5} />
        </button>
      )}
      {all.length > JAR_DEFAULT_COUNT && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.jar.shuffle}
          title={t.jar.shuffle}
          onClick={jarContent.shuffle}
        >
          <Shuffle aria-hidden="true" size={22} strokeWidth={1.5} />
        </button>
      )}
      <button
        type="button"
        className={common.icon}
        aria-label={t.jar.pick}
        title={t.jar.pick}
        onClick={onPick}
      >
        <ListChecks aria-hidden="true" size={22} strokeWidth={1.5} />
      </button>
    </div>
  );

  return (
    <JarFrame tools={tools}>
      {!USE_3D && (
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.table} />
          <div className={styles.pool} />
          <div className={styles.beam} />
          <div className={styles.dust}>
            {MOTES.map((m) => (
              <i key={m.y} className={styles.mote} style={moteStyle(m)} />
            ))}
          </div>
        </div>
      )}
      {!USE_3D && <canvas ref={backGlass} className={styles.glass} aria-hidden="true" />}
      <canvas
        ref={attach}
        className={USE_3D ? styles.canvas3d : styles.canvas}
        aria-hidden="true"
      />
      {!USE_3D && (
        <canvas
          ref={frontGlass}
          className={`${styles.glass} ${styles.reflected}`}
          aria-hidden="true"
        />
      )}
      <ul className={common.visuallyHidden} aria-label={t.jar.list}>
        {shown.map((s) => (
          <li key={s.id}>{snsDisplay(s.sticker.snsKind, s.sticker.snsId)}</li>
        ))}
      </ul>
    </JarFrame>
  );
}
