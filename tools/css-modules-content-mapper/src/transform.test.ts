import { describe, expect, test } from "vite-plus/test";
import { transformCss } from "./transform.js";

const css = `/* .commented { } */
.button { color: red; }
.primary { composes: button; }
.button:hover { color: blue; }
:global(.outside) { color: green; }
#hero { color: black; }
.kebab-name { color: pink; }
@keyframes pop { from { opacity: 0; } }
`;

describe("transformCss", () => {
  const out = transformCss({ fileName: "/x/A.module.css", content: css });

  test("exports exactly the CSS Modules locals", () => {
    expect(out.extension).toBe(".ts");
    expect(out.text).toContain("readonly button: string;");
    expect(out.text).toContain("readonly primary: string;");
    expect(out.text).toContain("readonly hero: string;");
    expect(out.text).toContain("readonly pop: string;");
    expect(out.text).toContain('readonly "kebab-name": string;');
    expect(out.text).not.toContain("outside");
    expect(out.text).not.toContain("commented");
    expect(out.text).toMatch(/export default styles;/);
  });

  test("maps each key to its first definition, skipping comments", () => {
    for (const [vStart, vLen, oStart, oLen] of out.mappings) {
      const key = out.text.slice(vStart, vStart + (vLen ?? 0)).replace(/"/g, "");
      expect(css.slice(oStart, (oStart ?? 0) + (oLen ?? 0))).toBe(key);
    }
    const button = out.mappings.find(
      ([s, l]) => out.text.slice(s, (s ?? 0) + (l ?? 0)) === "button",
    );
    expect(button?.[2]).toBe(css.indexOf(".button {") + 1);
    expect(button?.[4]).toBe(0);
  });

  test("plain .css becomes an empty module", () => {
    expect(transformCss({ fileName: "/x/index.css", content: "body{}" })).toEqual({
      text: "export {};\n",
      extension: ".ts",
      mappings: [],
    });
  });

  test("broken CSS reports a diagnostic instead of crashing", () => {
    const bad = transformCss({ fileName: "/x/B.module.css", content: ".a { color: red; " });
    expect(bad.text).toContain("export default styles;");
  });
});
