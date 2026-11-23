// Project-local oxlint JS plugin (ESLint-compatible API).

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);
const EFFECT_DIR = /[\\/]src[\\/]ui[\\/]effects[\\/]/;

const hookName = (callee) => {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
};

const isFunctionNode = (n) =>
  n != null && (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression");

function returnsCleanup(fn) {
  if (fn.body.type !== "BlockStatement") {
    return isFunctionNode(fn.body);
  }
  const returns = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node !== fn.body && (isFunctionNode(node) || node.type === "FunctionDeclaration")) return;
    if (node.type === "ReturnStatement") {
      returns.push(node);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  };
  visit(fn.body);
  if (returns.length === 0) return false;
  return returns.every(
    (r) => r.argument != null && (isFunctionNode(r.argument) || r.argument.type === "Identifier"),
  );
}

const effectLocation = {
  meta: {
    type: "problem",
    docs: { description: "Effects are only allowed in custom hooks under src/ui/effects/" },
    messages: {
      where: "{{name}} は src/ui/effects/ のカスタムフックの中だけで使う (ui-conventions §6)",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (EFFECT_DIR.test(filename)) return {};
    return {
      CallExpression(node) {
        const name = hookName(node.callee);
        if (name && EFFECT_HOOKS.has(name))
          context.report({ node, messageId: "where", data: { name } });
      },
    };
  },
};

const effectCleanup = {
  meta: {
    type: "problem",
    docs: { description: "Effects must return a cleanup function that undoes their side effect" },
    messages: {
      cleanup: "{{name}} は副作用を解除するクリーンアップ関数を必ず返す (ui-conventions §6)",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = hookName(node.callee);
        if (!name || !EFFECT_HOOKS.has(name)) return;
        const fn = node.arguments[0];
        if (!isFunctionNode(fn) || fn.async || !returnsCleanup(fn)) {
          context.report({ node, messageId: "cleanup", data: { name } });
        }
      },
    };
  },
};

const SETTER = /^(set[A-Z]\w*|dispatch|set)$/;

const noSetInEffect = {
  meta: {
    type: "problem",
    docs: { description: "No state updates at the top level of an effect" },
    messages: {
      set: "{{name}} を effect の直下で呼ばない(描画が 1 回増える)。描画中に計算するか、イベントや外部ストアで扱う (ui-conventions §8)",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = hookName(node.callee);
        if (!name || !EFFECT_HOOKS.has(name)) return;
        const fn = node.arguments[0];
        if (!isFunctionNode(fn) || fn.body.type !== "BlockStatement") return;
        for (const stmt of fn.body.body) {
          const call = stmt.type === "ExpressionStatement" ? stmt.expression : undefined;
          if (
            call?.type === "CallExpression" &&
            call.callee.type === "Identifier" &&
            SETTER.test(call.callee.name)
          ) {
            context.report({ node: call, messageId: "set", data: { name: call.callee.name } });
          }
        }
      },
    };
  },
};

const noLet = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer const and readonly state machines over let" },
    messages: {
      let: "let ではなく const と useReducer のステートマシンを使う (ui-conventions §6)",
    },
  },
  create(context) {
    return {
      VariableDeclaration(node) {
        if (node.kind === "let") context.report({ node, messageId: "let" });
      },
    };
  },
};

export default {
  meta: { name: "local" },
  rules: {
    "effect-location": effectLocation,
    "effect-cleanup": effectCleanup,
    "no-let": noLet,
    "no-set-in-effect": noSetInEffect,
  },
};
