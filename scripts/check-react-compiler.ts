import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { transformSync } from "@babel/core";

type Event = {
  kind: string;
  fnName?: string | null;
  reason?: string;
  detail?: unknown;
  fnLoc?: unknown;
};

const root = new URL("../src/ui/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const problems: string[] = [];
const compiled = { count: 0 };

for (const file of files(root)) {
  const events: Event[] = [];
  transformSync(readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        "babel-plugin-react-compiler",
        {
          compilationMode: "infer",
          panicThreshold: "none",
          logger: { logEvent: (_: string | null, e: Event) => events.push(e) },
        },
      ],
    ],
  });
  for (const e of events) {
    if (e.kind === "CompileSuccess") compiled.count++;
    if (e.kind === "CompileError" || e.kind === "CompileSkip" || e.kind === "PipelineError") {
      const detail =
        (e.detail as { options?: { reason?: string }; reason?: string } | undefined)?.options
          ?.reason ??
        (e.detail as { reason?: string } | undefined)?.reason ??
        e.reason ??
        "";
      problems.push(
        `${relative(process.cwd(), file)}: ${e.kind} ${e.fnName ?? ""} ${detail}`.trim(),
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`React Compiler could not optimize ${problems.length} function(s):`);
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log(`React Compiler: ${compiled.count} components/hooks compiled, no bail-outs`);
