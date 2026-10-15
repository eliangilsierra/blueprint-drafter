// Isolation rules for src/core/** (architecture section 7.9, NFR-2, NFR-8, NFR-10; issues #5 and #59).
// The core must stay pure and local: no code evaluation, no child processes, no network, and file access only
// where a grant below allows it. Inline directives (eslint-disable and friends) are ignored in the core, so the
// rules cannot be switched off from inside the code they guard. Never weaken these rules to make a change pass;
// move the code to an adapter (src/cli, src/mcp) instead.
//
// Two layers, both linted:
// 1. Allow-list (rule blueprint-drafter/core-imports, eslint-rules/core-imports.js): every import form (static,
//    `export ... from`, `import x = require()`, `import()`, `require()`) may name only a file that resolves inside
//    src/core, a Node.js built-in from CORE_NODE_MODULES (written "node:<name>"), or a reviewed package from
//    eslint-rules/core-allowlist.js. Narrower grants are separate blocks below, each with the task that needs it.
//    A single local rule instead of no-restricted-imports with the pattern "*": gitignore-style patterns cannot
//    tell whether "../" stays inside src/core, and no-restricted-imports does not see import() or require(), so
//    the list would have to be written three times.
// 2. Deny-list (no-restricted-imports, no-restricted-syntax, no-restricted-globals, no-restricted-properties):
//    names the forbidden modules and globals, so the message is explicit when one of them is used.
//
// Aliases of process and globalThis, and the Function constructor through a prototype (decision of #59):
// rejected by lint. blueprint-drafter/core-globals (eslint-rules/core-globals.js) allows `process`, `globalThis`,
// `global`, `module` and `require` only in a direct, non-computed read of an allowed member (CORE_GLOBAL_MEMBERS),
// so `const p = process`, `const { getBuiltinModule } = process`, `const g = globalThis` and
// `globalThis["fe" + "tch"]` cannot be written; it uses scope analysis, so it is not noisy (a property named
// `process` or a type position is not a use). Selectors reject `.constructor` and the string "constructor", which
// closes `(() => {}).constructor("...")`. Forms that lint cannot see (a computed name such as
// `Reflect.get(fn, "constr" + "uctor")`, or a third-party package that computes a module name) are caught at run
// time by the throwing stubs of
// test/scaffold/support/forbidden-apis.ts (AC-44); test/scaffold/core-isolation.test.ts and core-stubs.test.ts
// pin both layers. The control stops mistakes and casual bypasses; it is not a sandbox.

import { fileURLToPath } from "node:url";

import { corePackages } from "./eslint-rules/core-allowlist.js";
import plugin from "./eslint-rules/index.js";

/** Modules that the core must never load (deny-list); also the scan list of the dependency review. */
export const FORBIDDEN_MODULES = [
  "child_process",
  "vm",
  "net",
  "http",
  "https",
  "http2",
  "tls",
  "dgram",
  "dns",
  // Other ways to start a process, run code in another context or load code by name:
  "cluster",
  "worker_threads",
  "inspector",
  "wasi",
  "module", // createRequire() reaches every forbidden module through a require function
];

/**
 * Pure Node.js built-ins that every core file may import (allow-list). Each one is used by a planned module:
 * path and url to locate the bundled fonts (#17) and resolve paths (#34), util for deterministic helpers (#9),
 * buffer for base64 font embedding (#30), crypto for hashing only (font SHA-256 #17, content hash #34, derived
 * export ids #32 #33), perf_hooks for the layout time budget (#21).
 */
export const CORE_NODE_MODULES = ["node:buffer", "node:crypto", "node:path", "node:perf_hooks", "node:url", "node:util"];

/** Members of the restricted globals that the core may read directly; anything else is a use as a value. */
export const CORE_GLOBAL_MEMBERS = {
  process: ["platform"], // case rules of the workspace policy on Windows and macOS (#34)
  globalThis: [],
  global: [],
  module: [],
};

const CORE_FILES = "src/core/**/*.{ts,mts,cts}";
const coreDirectory = fileURLToPath(new URL("./src/core", import.meta.url));

// No slash in the pattern: esquery (no-restricted-syntax selectors) ends a regular expression at the first slash.
// The escape written as backslash-u002f stands for the slash, so subpaths such as dns/promises match but names such as net-utils do not.
const modulePattern = (modules) => `^(node:)?(${modules.join("|")})(\\u002f.*)?$`;

const FORBIDDEN_GLOBALS = ["eval", "Function", "fetch", "XMLHttpRequest", "WebSocket", "EventSource"];

// Ways to load a built-in module or native code without an import statement.
const FORBIDDEN_PROCESS_PROPERTIES = ["getBuiltinModule", "binding", "dlopen"];

const message = "src/core must be pure and local (no code evaluation, processes or network). Use an adapter instead.";
const dynamicMessage =
  "src/core must load modules by string literal only: a computed specifier hides what is loaded. Use an adapter instead.";
const constructorMessage =
  "src/core must not read `.constructor`: it reaches the Function constructor (code evaluation). Use instanceof or Object.getPrototypeOf instead.";

/** Deny-list rules for the given forbidden modules (a grant block removes the module it grants). */
function denyRules(forbiddenModules) {
  const pattern = modulePattern(forbiddenModules);
  return {
    "no-restricted-imports": ["error", { patterns: [{ regex: pattern, message }] }],
    "no-restricted-syntax": [
      "error",
      { selector: `ImportExpression[source.value=/${pattern}/]`, message },
      { selector: `CallExpression[callee.name='require'][arguments.0.value=/${pattern}/]`, message },
      { selector: "ImportExpression:not([source.type='Literal'])", message: dynamicMessage },
      { selector: "CallExpression[callee.name='require']:not([arguments.0.type='Literal'])", message: dynamicMessage },
      // `.constructor` reaches the Function constructor: member access, destructuring and the name as a string
      // (`f["constructor"]`, `Reflect.get(f, "constructor")`). A computed name is left to the throwing stubs.
      { selector: "MemberExpression[computed=false][property.name='constructor']", message: constructorMessage },
      { selector: "ObjectPattern > Property[computed=false][key.name='constructor']", message: constructorMessage },
      { selector: "Literal[value='constructor']", message: constructorMessage },
      { selector: "TemplateElement[value.cooked='constructor']", message: constructorMessage },
    ],
  };
}

/** Allow-list rule options for a block: the core-wide Node.js modules plus the block's grant. */
function allowImports(grantedNodeModules = []) {
  return [
    "error",
    {
      coreDirectory,
      nodeModules: [...CORE_NODE_MODULES, ...grantedNodeModules],
      packages: corePackages.map((entry) => entry.name),
    },
  ];
}

/** Flat config objects that apply to the core only. */
export const coreIsolation = [
  {
    name: "blueprint-drafter/core-isolation",
    // tsc compiles .mts and .cts too, so the rules must cover them.
    files: [CORE_FILES],
    linterOptions: { noInlineConfig: true },
    plugins: { "blueprint-drafter": plugin },
    rules: {
      "blueprint-drafter/core-imports": allowImports(),
      "blueprint-drafter/core-globals": ["error", { allowedMembers: CORE_GLOBAL_MEMBERS }],
      "no-eval": ["error", { allowIndirect: false }],
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-globals": [
        "error",
        ...FORBIDDEN_GLOBALS.map((name) => ({ name, message })),
      ],
      "no-restricted-properties": [
        "error",
        ...["eval", "Function", "fetch"].map((property) => ({ object: "globalThis", property, message })),
        ...FORBIDDEN_PROCESS_PROPERTIES.map((property) => ({ object: "process", property, message })),
      ],
      ...denyRules(FORBIDDEN_MODULES),
    },
  },
  {
    // Task #34 (workspace-confined file access, atomic writes): src/core/io is the only core module that reads
    // and writes user files (architecture section 9 B2).
    name: "blueprint-drafter/core-isolation/io-fs",
    files: ["src/core/io/**/*.{ts,mts,cts}"],
    rules: { "blueprint-drafter/core-imports": allowImports(["node:fs", "node:fs/promises"]) },
  },
  {
    // Task #17 (text measurement): the font loader reads the vendored files under fonts/ and nothing else.
    // Only this file of src/core/text gets the grant; measuring and wrapping stay pure.
    name: "blueprint-drafter/core-isolation/text-font-loader",
    files: ["src/core/text/fonts.ts"],
    rules: { "blueprint-drafter/core-imports": allowImports(["node:fs", "node:fs/promises"]) },
  },
  {
    // Task #21 (layout worker with a time budget and a heap ceiling): a worker thread is not a child process.
    // Only the worker entry and its runner may use node:worker_threads; the deny-list drops it for these two files.
    name: "blueprint-drafter/core-isolation/layout-worker",
    files: ["src/core/layout/worker.ts", "src/core/layout/worker-runner.ts"],
    rules: {
      "blueprint-drafter/core-imports": allowImports(["node:worker_threads"]),
      ...denyRules(FORBIDDEN_MODULES.filter((name) => name !== "worker_threads")),
    },
  },
];
