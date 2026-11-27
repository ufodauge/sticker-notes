import type { EventType } from "./events.ts";

// The album's guided flows, written as data: each a line of states, and the event that moves on
// from each. The tutorial runs on them, the tests walk them, and the debug flow view draws them
// (states as boxes, events as the arrows between).

export type FlowState = {
  readonly id: string;
  // what the state is, for people reading the flow (the debug view shows it)
  readonly note: string;
  // the event that moves on to the next state (none: the flow ends here)
  readonly on?: EventType;
};

export type FlowDef = {
  readonly id: string;
  readonly note: string;
  readonly states: readonly FlowState[];
};

// The first visit, opened as it is: the album starts with sample stickers to learn on. No words:
// each step shows itself (a corner lifting, a page's corner folding, a button beating), and a
// finger shows how only when nothing is done for a while.
const tutorialStart: FlowDef = {
  id: "tutorial.start",
  note: "はじめて開いた人(見本のシールで覚える)",
  states: [
    { id: "peel", note: "見本の一枚の角がめくれかけている: 剥がす", on: "sticker.peeled" },
    { id: "place", note: "好きな所に貼る", on: "sticker.placed" },
    {
      id: "turn",
      note: "ページの角が折れかけている: めくる(次のページに見本がもう一枚)",
      on: "page.turned",
    },
    { id: "pocket", note: "友だちのシールがポケットに届く: 引き出して貼る", on: "sticker.placed" },
    { id: "create", note: "作るボタンが脈打つ: お返しを作る", on: "create.opened" },
    {
      id: "making",
      note: "作っている: 閉じたら最後のカード(何も作らずに閉じたら静かに終わる)",
      on: "create.closed",
    },
    { id: "outro", note: "交換のしかた(QR を読んでもらう)", on: "tutorial.finish" },
    { id: "done", note: "おわり" },
  ],
};

// The first visit, by a sticker someone shared: that one is the sticker to learn on.
const tutorialReceived: FlowDef = {
  id: "tutorial.received",
  note: "交換のリンクから来た人(もらったシールで覚える)",
  states: [
    { id: "place", note: "届いたシールでポケットが揺れる: 引き出して貼る", on: "sticker.placed" },
    { id: "create", note: "作るボタンが脈打つ: お返しを作る", on: "sticker.created" },
    { id: "give", note: "お返しのQRを見せる", on: "qr.closed" },
    { id: "outro", note: "お返しは相手が QR を読むと届く", on: "tutorial.finish" },
    { id: "done", note: "おわり" },
  ],
};

// An exchange, from the receiving side: something to see for the debug view (it runs over and
// over, one round each sticker received).
const exchange: FlowDef = {
  id: "exchange",
  note: "交換(受け取る側)",
  states: [
    { id: "waiting", note: "リンクを待つ", on: "sticker.received" },
    { id: "received", note: "ポケットに入った(初めての人ならスタンプ)", on: "sticker.placed" },
    { id: "stuck", note: "貼った", on: "create.opened" },
    { id: "giving", note: "お返しを作る", on: "sticker.created" },
    { id: "given", note: "お返しのQRを見せる", on: "qr.closed" },
    { id: "done", note: "一往復" },
  ],
};

export const FLOWS = {
  "tutorial.start": tutorialStart,
  "tutorial.received": tutorialReceived,
  exchange,
} as const satisfies Record<string, FlowDef>;

export type FlowId = keyof typeof FLOWS;

// Where a flow is: the index of its state.
export type FlowAt = { readonly flow: FlowId; readonly at: number };

export const stateOf = (f: FlowAt): FlowState | undefined => FLOWS[f.flow].states[f.at];

export const isOver = (f: FlowAt): boolean => stateOf(f)?.on === undefined;

// An event moves a flow on only when it is the one its state waits for.
export function step(f: FlowAt, event: EventType): FlowAt {
  const state = stateOf(f);
  if (!state || state.on !== event) return f;
  return { ...f, at: Math.min(f.at + 1, FLOWS[f.flow].states.length - 1) };
}
