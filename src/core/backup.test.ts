import { describe, expect, test } from "vite-plus/test";
import type { Page, Placement } from "./album.ts";
import { parseBackup, planMerge, serializeBackup, type BackupData } from "./backup.ts";
import { encodeBody, stickerIdOf } from "./payload.ts";
import { FIXTURES } from "./testing/fixtures.ts";

async function sample(): Promise<BackupData> {
  const stickers = await Promise.all(
    Object.values(FIXTURES).map(async (s, i) => {
      const body = encodeBody(s);
      return {
        id: await stickerIdOf(body),
        body,
        origin: i === 0 ? ("mine" as const) : ("received" as const),
        receivedAt: i === 0 ? null : "2026-11-23",
      };
    }),
  );
  const pages: Page[] = [{ id: "p1", order: 0 }];
  const first = stickers[1];
  const placements: Placement[] = first
    ? [
        {
          id: "pl1",
          pageId: "p1",
          stickerId: first.id,
          x: 0.3,
          y: 0.4,
          scale: 2,
          rotation: -12,
          z: 1,
        },
      ]
    : [];
  return { stickers, pages, placements };
}

describe("backup", () => {
  test("round trip", async () => {
    const data = await sample();
    const r = await parseBackup(serializeBackup(data, new Date("2026-11-23T00:00:00Z")));
    expect(r).toEqual({ ok: true, data, skipped: 0 });
  });

  test("rejects non-backups and newer versions", async () => {
    expect(await parseBackup("nope")).toEqual({ ok: false, reason: "not-json" });
    expect(await parseBackup("{}")).toEqual({ ok: false, reason: "not-backup" });
    expect(await parseBackup('{"format":"sticker-notes-backup","version":3}')).toEqual({
      ok: false,
      reason: "newer-version",
    });
  });

  test("skips tampered stickers and dangling placements", async () => {
    const data = await sample();
    const json = JSON.parse(serializeBackup(data, new Date())) as {
      stickers: { id: string; body: string }[];
      placements: unknown[];
    };
    const s0 = json.stickers[0];
    const s1 = json.stickers[1];
    if (!s0 || !s1) throw new Error();
    s0.id = "0".repeat(32);
    s1.body = "!!!";
    json.placements.push({
      id: "x",
      pageId: "missing",
      stickerId: "0".repeat(32),
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      z: 1,
    });
    const r = await parseBackup(JSON.stringify(json));
    expect(r.ok && r.data.stickers.length).toBe(data.stickers.length - 2);
    expect(r.ok && r.data.placements).toEqual([]);
    expect(r.ok && r.skipped).toBe(4);
  });

  test("merge never duplicates stickers or double-places one", async () => {
    const data = await sample();
    const again = planMerge(data, data);
    expect(again).toEqual({ stickers: [], pages: [], placements: [] });

    const empty: BackupData = {
      stickers: [],
      pages: [{ id: "mine", order: 0 }],
      placements: [],
    };
    const plan = planMerge(empty, data);
    expect(plan.stickers).toHaveLength(data.stickers.length);
    expect(plan.pages).toEqual([{ id: "p1", order: 1 }]);
    expect(plan.placements).toHaveLength(1);
  });
});

describe("backup parsing details", () => {
  const header = { format: "sticker-notes-backup", version: 1 };

  test("a file without lists is an empty backup", async () => {
    expect(await parseBackup(JSON.stringify(header))).toEqual({
      ok: true,
      data: { stickers: [], pages: [], placements: [] },
      skipped: 0,
    });
  });

  test("files over 20 MiB are rejected before parsing", async () => {
    const limit = 20 * 1024 * 1024;
    expect(await parseBackup("x".repeat(limit + 1))).toEqual({ ok: false, reason: "too-large" });
    expect(await parseBackup("x".repeat(limit))).toEqual({ ok: false, reason: "not-json" });
  });

  test("malformed entries are skipped and counted, never thrown", async () => {
    const data = await sample();
    const base = JSON.parse(serializeBackup(data, new Date())) as Record<string, unknown[]>;
    const json = {
      ...base,
      stickers: [...(base.stickers ?? []), null, 5, {}, { id: "x", body: "", origin: "mine" }],
      pages: [...(base.pages ?? []), null, { id: "", order: 1 }, { id: "q", order: "x" }],
      placements: [...(base.placements ?? []), "nope", { id: "z" }],
    };
    const r = await parseBackup(JSON.stringify(json));
    expect(r.ok && r.data).toEqual(data);
    expect(r.ok && r.skipped).toBe(4 + 3 + 2);
  });

  test("a sticker is placed at most once; extra placements are skipped", async () => {
    const data = await sample();
    const first = data.placements[0] as Placement;
    const json = JSON.parse(serializeBackup(data, new Date())) as { placements: unknown[] };
    json.placements.push({ ...first, id: "second" });
    const r = await parseBackup(JSON.stringify(json));
    expect(r.ok && r.data.placements).toEqual([first]);
    expect(r.ok && r.skipped).toBe(1);
  });

  test("receivedAt is kept when it is a valid date", async () => {
    const data = await sample();
    const [mine, received] = data.stickers;
    if (!mine || !received) throw new Error();
    const entry = (s: typeof mine, origin: string, receivedAt: unknown) => ({
      id: s.id,
      body: btoa(String.fromCharCode(...s.body)),
      origin,
      receivedAt,
    });
    const parse = async (e: object) => {
      const r = await parseBackup(JSON.stringify({ ...header, stickers: [e] }));
      return r.ok ? r.data.stickers[0]?.receivedAt : "failed";
    };
    expect(await parse(entry(received, "received", "2026-11-23"))).toBe("2026-11-23");
    expect(await parse(entry(received, "received", "x2026-11-23"))).toBeNull();
    expect(await parse(entry(received, "received", "2026-11-23x"))).toBeNull();
    expect(await parse(entry(received, "received", "2026-1-23"))).toBeNull();
    expect(await parse(entry(received, "received", null))).toBeNull();
    expect(await parse(entry(mine, "mine", "2026-11-23"))).toBe("2026-11-23");
  });
});

describe("planMerge details", () => {
  const pl = (id: string, stickerId: string, pageId = "p1"): Placement => ({
    id,
    pageId,
    stickerId,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    z: 1,
  });
  const none: BackupData = { stickers: [], pages: [], placements: [] };

  test("incoming pages are appended in their own order after the existing ones", () => {
    const current: BackupData = {
      ...none,
      pages: [
        { id: "a", order: 4 },
        { id: "b", order: 2 },
      ],
    };
    const incoming: BackupData = {
      ...none,
      pages: [
        { id: "n3", order: 30 },
        { id: "a", order: 0 },
        { id: "n1", order: 10 },
        { id: "n2", order: 20 },
      ],
    };
    expect(planMerge(current, incoming).pages).toEqual([
      { id: "n1", order: 5 },
      { id: "n2", order: 6 },
      { id: "n3", order: 7 },
    ]);
  });

  test("a placement id already in use is dropped", () => {
    const current: BackupData = {
      ...none,
      pages: [{ id: "p1", order: 0 }],
      placements: [pl("same", "s1")],
    };
    const incoming: BackupData = { ...none, placements: [pl("same", "s2")] };
    expect(planMerge(current, incoming).placements).toEqual([]);
  });

  test("a sticker that is already placed is not placed twice", () => {
    const current: BackupData = {
      ...none,
      pages: [{ id: "p1", order: 0 }],
      placements: [pl("a", "s1")],
    };
    const incoming: BackupData = { ...none, placements: [pl("b", "s1"), pl("c", "s2")] };
    expect(planMerge(current, incoming).placements.map((p) => p.id)).toEqual(["c"]);
  });

  test("placements need a page that exists now or is being added", () => {
    const incoming: BackupData = {
      ...none,
      pages: [{ id: "new", order: 0 }],
      placements: [pl("a", "s1", "new"), pl("b", "s2", "ghost")],
    };
    expect(planMerge(none, incoming).placements.map((p) => p.id)).toEqual(["a"]);
  });

  test("stickers on the desk need no page, and a surface takes only as many as it holds", () => {
    const current: BackupData = {
      ...none,
      placements: [pl("d1", "s1", "surface:desk"), pl("d2", "s2", "surface:desk")],
    };
    const incoming: BackupData = {
      ...none,
      placements: [
        pl("d3", "s3", "surface:desk"),
        pl("d4", "s4", "surface:desk"),
        pl("d5", "s5", "surface:desk"),
        pl("l1", "s6", "surface:laptop"),
      ],
    };
    expect(planMerge(current, incoming).placements.map((p) => p.id)).toEqual(["d3", "d4", "l1"]);
  });
});

describe("surfaces in a backup", () => {
  test("a sticker on the desk or the laptop is kept, up to what each surface holds", async () => {
    const data = await sample();
    const [a, b, c, d, e] = data.stickers;
    if (!a || !b || !c || !d || !e) throw new Error("fixtures");
    const at = (id: string, stickerId: string, pageId: string): Placement => ({
      id,
      pageId,
      stickerId,
      x: 0.5,
      y: 0.5,
      scale: 2,
      rotation: 0,
      z: 1,
    });
    const placements = [
      at("d1", a.id, "surface:desk"),
      at("d2", b.id, "surface:desk"),
      at("d3", c.id, "surface:desk"),
      at("d4", d.id, "surface:desk"),
      at("d5", e.id, "surface:desk"),
    ];
    const r = await parseBackup(serializeBackup({ ...data, placements }, new Date()));
    expect(r.ok && r.data.placements.map((p) => p.id)).toEqual(["d1", "d2", "d3", "d4"]);
    expect(r.ok && r.skipped).toBe(1);
    expect(r.ok && r.data.pages).toEqual(data.pages);
  });
});
