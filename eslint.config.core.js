// Isolation rules for src/core/** (architecture section 7.9, NFR-2, NFR-8, NFR-10).
// The core must stay pure and local: no code evaluation, no child processes, no network.
// Inline directives (eslint-disable and friends) are ignored in the core, so the rules cannot be switched off
// from inside the code they guard. Never weaken these rules to make a change pass; move the code to an adapter
// (src/cli, src/mcp) instead.
//
// This is a deny-list: it stops the common mistakes, not a determined bypass (aliasing globalThis, calling
// the Function constructor through a prototype, importing a third-party package that spawns processes).
// The isolation tests with throwing stubs (architecture section 7.9, AC-44) are the second layer; they arrive
// with the first core module.

const FORBIDDEN_MODULES = [
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

// No slash in the pattern: esquery (no-restricted-syntax selectors) ends a regular expression at the first slash.
// The escape written as backslash-u002f stands for the slash, so subpaths such as dns/promises match but names such as net-utils do not.
const FORBIDDEN_MODULE_PATTERN = `^(node:)?(${FORBIDDEN_MODULES.join("|")})(\\u002f.*)?$`;

const FORBIDDEN_GLOBALS = ["eval", "Function", "fetch", "XMLHttpRequest", "WebSocket", "EventSource"];

// Ways to load a built-in module or native code without an import statement.
const FORBIDDEN_PROCESS_PROPERTIES = ["getBuiltinModule", "binding", "dlopen"];

const message = "src/core must be pure and local (no code evaluation, processes or network). Use an adapter instead.";
const dynamicMessage =
  "src/core must load modules by string literal only: a computed specifier hides what is loaded. Use an adapter instead.";

/** Flat config objects that apply to the core only. */
export const coreIsolation = [
  {
    name: "blueprint-drafter/core-isolation",
    // tsc compiles .mts and .cts too, so the rules must cover them.
    files: ["src/core/**/*.{ts,mts,cts}"],
    linterOptions: { noInlineConfig: true },
    rules: {
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
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: FORBIDDEN_MODULE_PATTERN,
              message,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/${FORBIDDEN_MODULE_PATTERN}/]`,
          message,
        },
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value=/${FORBIDDEN_MODULE_PATTERN}/]`,
          message,
        },
        {
          selector: "ImportExpression:not([source.type='Literal'])",
          message: dynamicMessage,
        },
        {
          selector: "CallExpression[callee.name='require']:not([arguments.0.type='Literal'])",
          message: dynamicMessage,
        },
      ],
    },
  },
];
