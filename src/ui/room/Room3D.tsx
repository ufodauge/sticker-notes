import { useReducer, useRef } from "react";
import common from "../common.module.css";
import { debugText } from "../messages.ts";
import { createRoom, type Room, type Weather } from "./room-scene.ts";
import styles from "./Room3D.module.css";

// Debug builds only (`?room`): the three-dimensional desk, to try the idea before deciding on it.
// A weak device is warned (and drawn lighter): from what the browser says of it, and from how
// fast it actually draws.

type Nav = Navigator & { readonly deviceMemory?: number };

// what the browser says of the device
const weakByHints = (): boolean => {
  const n = navigator as Nav;
  return (n.deviceMemory !== undefined && n.deviceMemory < 4) || (n.hardwareConcurrency ?? 8) <= 4;
};

const WEATHERS: readonly Weather[] = ["clear", "cloudy", "rain", "snow"];

type Controls = {
  readonly hour: number;
  readonly month: number;
  readonly weather: Weather;
  readonly editing: boolean;
  readonly light: boolean;
  readonly slow: boolean;
};

export function Room3D() {
  const room = useRef<Room | null>(null);
  const [c, set] = useReducer((s: Controls, next: Partial<Controls>) => ({ ...s, ...next }), {
    hour: 10,
    month: 5,
    weather: "clear",
    editing: false,
    light: weakByHints(),
    slow: false,
  });

  // the scene lives as long as its box; rebuilt lighter if asked
  const mount = (host: HTMLDivElement | null) => {
    if (!host) return undefined;
    const r = createRoom(host, { light: c.light });
    room.current = r;
    r.setTime(c.hour, c.month);
    r.setWeather(c.weather);
    r.setEditing(c.editing);
    // drawn too slowly over its first seconds: a weak device after all
    const check = setTimeout(() => {
      if (r.fps() < 30) set({ slow: true });
    }, 3000);
    return () => {
      clearTimeout(check);
      r.dispose();
      room.current = null;
    };
  };

  const change = (next: Partial<Controls>) => {
    const s = { ...c, ...next };
    set(next);
    room.current?.setTime(s.hour, s.month);
    room.current?.setWeather(s.weather);
    room.current?.setEditing(s.editing);
  };

  return (
    <div className={styles.page}>
      <div key={c.light ? "light" : "full"} ref={mount} className={styles.stage} />
      {(c.slow || weakByHints()) && (
        <p className={styles.warn} role="status">
          {debugText.room.weak}
          {!c.light && (
            <button type="button" className={common.button} onClick={() => set({ light: true })}>
              {debugText.room.lighter}
            </button>
          )}
        </p>
      )}
      <div className={styles.panel}>
        <label className={styles.field}>
          <span>{debugText.room.hour(c.hour)}</span>
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={c.hour}
            onChange={(e) => change({ hour: Number(e.currentTarget.value) })}
          />
        </label>
        <label className={styles.field}>
          <span>{debugText.room.month(c.month)}</span>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={c.month}
            onChange={(e) => change({ month: Number(e.currentTarget.value) })}
          />
        </label>
        <div className={common.row} role="radiogroup" aria-label={debugText.room.weather}>
          {WEATHERS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={c.weather === w}
              className={common.button}
              data-on={c.weather === w || undefined}
              onClick={() => change({ weather: w })}
            >
              {debugText.room.weathers[w]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={common.button}
          aria-pressed={c.editing}
          data-on={c.editing || undefined}
          onClick={() => change({ editing: !c.editing })}
        >
          {debugText.room.edit}
        </button>
        <p className={common.muted}>{debugText.room.hint}</p>
      </div>
    </div>
  );
}
