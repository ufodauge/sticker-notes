import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { EVENT_TYPES, type AppEvent, type EventType } from "../../core/events.ts";
import { FLOWS, step, type FlowAt, type FlowId } from "../../core/flows.ts";
import { events } from "../../data/events.ts";
import common from "../common.module.css";
import { debugText } from "../messages.ts";
import { tutorial } from "../tutorial/tutorial-store.ts";
import styles from "./FlowPanel.module.css";
import { flowPanel } from "./flow-panel.ts";

// Debug builds only: the album's flows (core/flows.ts) drawn over the running app, the state each
// is in, the events as they happen, and buttons to make any event happen. A tutorial is put at a
// state by clicking it.

// an event as the buttons make it (stickers by a made-up ID; someone new met, for the stamp)
function sample(type: EventType): AppEvent {
  switch (type) {
    case "sticker.peeled":
    case "sticker.placed":
    case "sticker.pocketed":
    case "sticker.created":
      return { type, stickerId: "debug" };
    case "sticker.received":
      return { type, stickerId: "debug", met: 1 + Math.floor(Math.random() * 9) };
    case "page.turned":
      return { type, spread: 1 };
    default:
      return { type };
  }
}

// where the exchange flow is, from the events so far (it starts again after each round)
function exchangeAt(log: readonly { readonly event: AppEvent }[]): FlowAt {
  const last = FLOWS.exchange.states.length - 1;
  return log.reduce<FlowAt>(
    (f, { event }) => step(f.at === last ? { ...f, at: 0 } : f, event.type),
    { flow: "exchange", at: 0 },
  );
}

const details = (event: AppEvent) => {
  const { type: _, ...rest } = event;
  return Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
};

export function FlowPanel() {
  const log = useSyncExternalStore(events.subscribe, events.log);
  const t = useSyncExternalStore(tutorial.subscribe, tutorial.get);
  const at: Partial<Record<FlowId, number>> = {
    exchange: exchangeAt(log).at,
    ...(t && "flow" in t ? { [t.flow]: t.at } : {}),
  };
  return (
    <aside className={styles.panel} aria-label={debugText.flows}>
      <header className={styles.head}>
        <h2 className={styles.title}>{debugText.flows}</h2>
        <button
          type="button"
          className={common.icon}
          aria-label={debugText.flowsClose}
          title={debugText.flowsClose}
          onClick={() => flowPanel.toggle(false)}
        >
          <X aria-hidden="true" size={18} strokeWidth={1.5} />
        </button>
      </header>

      {(Object.keys(FLOWS) as FlowId[]).map((id) => {
        const flow = FLOWS[id];
        const tutorialFlow = id === "tutorial.start" || id === "tutorial.received";
        return (
          <section key={id} data-flow={id}>
            <h3 className={styles.flowTitle}>
              {id} <span className={styles.note}>{flow.note}</span>
            </h3>
            <ol className={styles.states}>
              {flow.states.map((s, i) => (
                <li key={s.id} className={styles.state}>
                  <button
                    type="button"
                    className={styles.box}
                    data-current={at[id] === i || undefined}
                    disabled={!tutorialFlow}
                    title={s.note}
                    onClick={() => {
                      if (!tutorialFlow) return;
                      tutorial.jump(s.on === undefined ? { done: true } : { flow: id, at: i });
                    }}
                  >
                    <span className={styles.stateId}>{s.id}</span>
                    <span className={styles.note}>{s.note}</span>
                  </button>
                  {s.on && <span className={styles.arrow}>{s.on} →</span>}
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <section>
        <h3 className={styles.flowTitle}>{debugText.flowsFire}</h3>
        <div className={styles.buttons}>
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={common.button}
              onClick={() => events.emit(sample(type))}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className={styles.flowTitle}>{debugText.flowsLog}</h3>
        <ol className={styles.log} reversed>
          {log.toReversed().map(({ at: time, event }, i) => (
            <li key={`${time}-${i}`}>
              <time className={styles.time}>{new Date(time).toLocaleTimeString()}</time>{" "}
              <code>{event.type}</code> <span className={styles.note}>{details(event)}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
