// Isolation rules for src/core/** (architecture section 7.9, NFR-2, NFR-8, NFR-10).
// The core must stay pure and local: no code evaluation, no child processes, no network.
// Never disable these rules to make a change pass; move the code to an adapter (src/cli, src/mcp) instead.

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
];

// No slash in the pattern: esquery (no-restricted-syntax selectors) ends a regular expression at the first slash.
// The escape written as backslash-u002f stands for the slash, so subpaths such as dns/promises match but names such as net-utils do not.
const FORBIDDEN_MODULE_PATTERN = `^(node:)?(${FORBIDDEN_MODULES.join("|")})(\\u002f.*)?$`;

const FORBIDDEN_GLOBALS = ["eval", "Function", "fetch", "XMLHttpRequest", "WebSocket", "EventSource"];

const message = "src/core must be pure and local (no code evaluation, processes or network). Use an adapter instead.";

/** Flat config objects that apply to the core only. */
export const coreIsolation = [
  {
    name: "blueprint-drafter/core-isolation",
    files: ["src/core/**/*.ts"],
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
      ],
    },
  },
];
