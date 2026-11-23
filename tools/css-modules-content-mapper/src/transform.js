// @ts-check
import { transform as lightning } from "lightningcss";

const VERBATIM = 0;
const ATOM = 1;

const MODULE_RE = /\.module\.css$/i;
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * @param {{ fileName: string; content: string }} params
 * @returns {{ text: string; extension: ".ts"; mappings: number[][]; diagnostics?: { messageText: string; start: number; length: number; code: number }[] }}
 */
export function transformCss({ fileName, content }) {
  if (!MODULE_RE.test(fileName)) {
    return { text: "export {};\n", extension: ".ts", mappings: [] };
  }

  /** @type {Record<string, { name: string }>} */
  let exportsMap;
  try {
    const result = lightning({
      filename: fileName,
      code: Buffer.from(content),
      cssModules: true,
      errorRecovery: true,
    });
    exportsMap = result.exports ?? {};
  } catch (error) {
    const loc = /** @type {{ loc?: { line: number; column: number } }} */ (error).loc;
    const start = loc ? offsetOf(content, loc.line, loc.column) : 0;
    return {
      text: "declare const styles: Readonly<Record<string, string>>;\nexport default styles;\n",
      extension: ".ts",
      mappings: [],
      diagnostics: [
        {
          messageText: `CSS parse error: ${/** @type {Error} */ (error).message}`,
          start,
          length: 1,
          code: 1,
        },
      ],
    };
  }

  const names = Object.keys(exportsMap).sort();
  /** @type {number[][]} */
  const mappings = [];
  let text = "declare const styles: {\n";
  for (const name of names) {
    const key = IDENT_RE.test(name) ? name : JSON.stringify(name);
    text += "  readonly ";
    const at = findDefinition(content, name);
    if (at >= 0) {
      mappings.push(
        key === name
          ? [text.length, key.length, at, name.length, VERBATIM]
          : [text.length, key.length, at, name.length, ATOM],
      );
    }
    text += `${key}: string;\n`;
  }
  text += "};\nexport default styles;\n";
  return { text, extension: ".ts", mappings };
}

/**
 * First position of `name` used as a class / id / keyframes name (not inside a comment).
 * @param {string} css
 * @param {string} name
 */
function findDefinition(css, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:[.#]|@keyframes\\s+)(${escaped})(?![\\w-])`, "g");
  const masked = maskComments(css);
  const m = re.exec(masked);
  return m ? m.index + m[0].length - name.length : -1;
}

/**
 * Replaces comment bodies with spaces so offsets stay identical.
 * @param {string} css
 */
function maskComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (/** @type {string} */ c) => " ".repeat(c.length));
}

/**
 * @param {string} text
 * @param {number} line 1-based
 * @param {number} column 1-based
 */
function offsetOf(text, line, column) {
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf("\n", offset);
    if (nl < 0) return text.length;
    offset = nl + 1;
  }
  return Math.min(text.length, offset + Math.max(0, column - 1));
}
