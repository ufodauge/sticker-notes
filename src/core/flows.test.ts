import { describe, expect, test } from "vite-plus/test";
import { EVENT_TYPES } from "./events.ts";
import { FLOWS, isOver, stateOf, step, type FlowAt, type FlowId } from "./flows.ts";

describe("flows", () => {
  test("every flow is a line that ends: each state but the last waits for a known event", () => {
    for (const flow of Object.values(FLOWS)) {
      const states = flow.states;
      expect(states.length).toBeGreaterThan(1);
      states.slice(0, -1).forEach((s) => expect(EVENT_TYPES).toContain(s.on));
      expect(states.at(-1)?.on).toBeUndefined();
      expect(new Set(states.map((s) => s.id)).size).toBe(states.length);
    }
  });

  test("an event moves a flow on only when its state waits for it", () => {
    const at: FlowAt = { flow: "tutorial.start", at: 1 };
    expect(stateOf(at)?.id).toBe("peel");
    expect(step(at, "sticker.placed")).toBe(at);
    expect(stateOf(step(at, "sticker.peeled"))?.id).toBe("place");
  });

  test.each(Object.keys(FLOWS) as FlowId[])("%s is walked to its end by its own events", (id) => {
    const end = FLOWS[id].states.reduce<FlowAt>((f, s) => (s.on ? step(f, s.on) : f), {
      flow: id,
      at: 0,
    });
    expect(isOver(end)).toBe(true);
    expect(stateOf(end)?.id).toBe("done");
    // and stays there
    expect(step(end, "tutorial.finish")).toBe(end);
  });
});
