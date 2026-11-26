import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";

// Prose rots silently: nothing fails when a document still describes a feature that is gone, and
// the next agent to read it may bring the feature back. Every feature taken out of the app is
// named here; a document may mention one only on a line that says it was removed.

const RETIRED = [
  "瓶",
  "アクリルブロック",
  "蓄光",
  "懐中電灯",
  "電気を消す",
  "照度センサー",
  "jar3d",
  "AmbientLightSensor",
];
const SAYS_REMOVED = /削除|廃止|やめた|消した/;

const DOCS = [
  "README.md",
  "AGENTS.md",
  ".claude/skills/ui-conventions/SKILL.md",
  ...readdirSync("docs")
    .filter((f) => f.endsWith(".md"))
    .map((f) => join("docs", f)),
];

test.each(DOCS)("%s mentions retired features only as removed", (path) => {
  const stale = readFileSync(path, "utf8")
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line }))
    .filter(({ text }) => RETIRED.some((term) => text.includes(term)) && !SAYS_REMOVED.test(text))
    .map(({ line, text }) => `${line}: ${text.slice(0, 80)}`);
  expect(stale).toEqual([]);
});
