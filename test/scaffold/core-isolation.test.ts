import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, sep } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

import { isRecord, readJson, repositoryRoot } from "./helpers.js";
import { COMPILED_EXTENSIONS, listFiles, listSymbolicLinks } from "./support/core-files.js";

// These tests load the real eslint.config.js of the repository, so removing or narrowing the isolation block
// (or the ignores) there makes them fail. Fixtures are linted as text at paths that do not exist on disk, which
// the type-aware project service cannot parse, so type-aware parsing is switched off on top of the real config;
// the isolation rules do not need type information.
const eslint = new ESLint({ cwd: repositoryRoot, overrideConfig: tseslint.configs.disableTypeChecked });

async function lint(code: string, relativePath: string): Promise<string[]> {
  const filePath = join(repositoryRoot, relativePath);
  assert.equal(await eslint.isPathIgnored(filePath), false, `${relativePath} must not be ignored`);
  const [result] = await eslint.lintText(code, { filePath });
  assert.ok(result, "ESLint returned no result");
  const fatal = result.messages.filter((message) => message.fatal === true);
  assert.deepEqual(fatal, [], "the fixture must parse");
  return result.messages.map((message) => message.ruleId ?? "no-rule");
}

const CORE_FILE = "src/core/fixture.ts";
const OUTSIDE_FILE = "src/cli/fixture.ts";
const CORE_IMPORTS = "blueprint-drafter/core-imports";
const CORE_GLOBALS = "blueprint-drafter/core-globals";

const FORBIDDEN: ReadonlyArray<readonly [string, string, string]> = [
  ["import of node:child_process", 'import { exec } from "node:child_process";\nexport const run = exec;\n', "no-restricted-imports"],
  ["import of child_process without prefix", 'import { spawn } from "child_process";\nexport const run = spawn;\n', "no-restricted-imports"],
  ["import of node:net", 'import { connect } from "node:net";\nexport const open = connect;\n', "no-restricted-imports"],
  ["import of node:http", 'import { get } from "node:http";\nexport const request = get;\n', "no-restricted-imports"],
  ["import of node:https", 'import { get } from "node:https";\nexport const request = get;\n', "no-restricted-imports"],
  ["import of node:dgram", 'import { createSocket } from "node:dgram";\nexport const open = createSocket;\n', "no-restricted-imports"],
  ["import of node:vm", 'import { runInNewContext } from "node:vm";\nexport const run = runInNewContext;\n', "no-restricted-imports"],
  ["import of a subpath, node:dns/promises", 'import { lookup } from "node:dns/promises";\nexport const resolve = lookup;\n', "no-restricted-imports"],
  ["import of node:module (createRequire reaches every module)", 'import { createRequire } from "node:module";\nexport const load = createRequire;\n', "no-restricted-imports"],
  ["import of node:worker_threads", 'import { Worker } from "node:worker_threads";\nexport const start = Worker;\n', "no-restricted-imports"],
  ["import of node:cluster", 'import cluster from "node:cluster";\nexport const fork = cluster;\n', "no-restricted-imports"],
  ["import of node:inspector", 'import { Session } from "node:inspector";\nexport const open = Session;\n', "no-restricted-imports"],
  ["import of node:wasi", 'import { WASI } from "node:wasi";\nexport const open = WASI;\n', "no-restricted-imports"],
  ["require of node:child_process", 'declare function require(id: string): unknown;\nexport const load = require("node:child_process");\n', "no-restricted-syntax"],
  ["require with a computed specifier", "declare function require(id: string): unknown;\nexport const load = (name: string): unknown => require(name);\n", "no-restricted-syntax"],
  ["dynamic import of node:child_process", 'export const load = () => import("node:child_process");\n', "no-restricted-syntax"],
  ["dynamic import with a variable specifier", "export const load = (name: string) => import(name);\n", "no-restricted-syntax"],
  ["dynamic import with a concatenated specifier", 'export const load = () => import("node:" + "child_process");\n', "no-restricted-syntax"],
  ["process.getBuiltinModule", 'export const load = (): unknown => process.getBuiltinModule("node:child_process");\n', "no-restricted-properties"],
  ["process.binding", 'export const load = (): unknown => process.binding("spawn_sync");\n', "no-restricted-properties"],
  ["process.dlopen", "export const load = (): unknown => process.dlopen;\n", "no-restricted-properties"],
  ["globalThis.fetch", 'export const load = () => globalThis.fetch("https://example.invalid");\n', "no-restricted-properties"],
  ["call of eval", "export const run = (source: string): unknown => eval(source);\n", "no-eval"],
  ["new Function", "export const make = (body: string): unknown => new Function(body);\n", "no-new-func"],
  ["call of fetch", 'export const load = () => fetch("https://example.invalid");\n', "no-restricted-globals"],
];

for (const [name, code, ruleId] of FORBIDDEN) {
  test(`src/core rejects ${name}`, async () => {
    const inCore = await lint(code, CORE_FILE);
    assert.ok(inCore.includes(ruleId), `expected ${ruleId}, got ${JSON.stringify(inCore)}`);
  });

  test(`the same code outside src/core is not rejected by that rule for ${name}`, async () => {
    const outside = await lint(code, OUTSIDE_FILE);
    assert.ok(!outside.includes(ruleId), `${ruleId} must not apply outside src/core, got ${JSON.stringify(outside)}`);
  });
}

// The type annotation makes the fixture fail to parse unless the TypeScript parser applies to the file extension.
const FORBIDDEN_IMPORT = 'import { exec } from "node:child_process";\nexport const run: unknown = exec;\n';

const INLINE_BYPASSES: ReadonlyArray<readonly [string, string]> = [
  ["a file-wide eslint-disable comment", `/* eslint-disable */\n${FORBIDDEN_IMPORT}`],
  ["a block eslint-disable comment naming the rule", `/* eslint-disable no-restricted-imports */\n${FORBIDDEN_IMPORT}`],
  ["an eslint-disable-next-line comment", `// eslint-disable-next-line no-restricted-imports\n${FORBIDDEN_IMPORT}`],
  ["an eslint-disable-line comment", 'import { exec } from "node:child_process"; // eslint-disable-line no-restricted-imports\nexport const run = exec;\n'],
];

for (const [name, code] of INLINE_BYPASSES) {
  test(`src/core still rejects node:child_process behind ${name}`, async () => {
    const inCore = await lint(code, CORE_FILE);
    assert.ok(inCore.includes("no-restricted-imports"), `expected no-restricted-imports, got ${JSON.stringify(inCore)}`);
  });
}

test("inline directives still work outside src/core (the restriction is scoped to the core)", async () => {
  const code = '/* eslint-disable no-console */\nconsole.log("x");\n';
  assert.deepEqual(await lint(code, OUTSIDE_FILE), []);
});

for (const extension of ["mts", "cts"]) {
  test(`src/core rejects node:child_process in a .${extension} file`, async () => {
    const inCore = await lint(FORBIDDEN_IMPORT, `src/core/fixture.${extension}`);
    assert.ok(inCore.includes("no-restricted-imports"), `expected no-restricted-imports, got ${JSON.stringify(inCore)}`);
  });

  test(`the same code in a .${extension} file outside src/core is not rejected by that rule`, async () => {
    const outside = await lint(FORBIDDEN_IMPORT, `src/cli/fixture.${extension}`);
    assert.ok(!outside.includes("no-restricted-imports"), JSON.stringify(outside));
  });
}

// Changed by #59: the deny-list must still not match a name that only starts like a forbidden module, but the
// allow-list now rejects every package that is not reviewed, so the fixture is no longer clean.
test("a module whose name only starts like a forbidden one is not matched by the deny-list in src/core", async () => {
  const code = 'import { x } from "net-utils";\nexport const y = x;\n';
  assert.deepEqual(await lint(code, CORE_FILE), [CORE_IMPORTS]);
});

test("a dynamic import of a relative module by string literal is allowed in src/core", async () => {
  const code = 'export const load = () => import("./other.js");\n';
  assert.deepEqual(await lint(code, CORE_FILE), []);
});

test("clean code in src/core passes", async () => {
  const code = 'import { join } from "node:path";\nexport const path = (name: string): string => join("a", name);\n';
  assert.deepEqual(await lint(code, CORE_FILE), []);
});

test("docs/research/** (the archived prototype, outside every tsconfig) is ignored by ESLint", async () => {
  const prototype = join(repositoryRoot, "docs", "research", "1-llm-native-diagramming", "prototype", "src", "model.ts");
  assert.equal(await eslint.isPathIgnored(prototype), true);
  assert.equal(await eslint.isPathIgnored(join(repositoryRoot, "docs", "research", "notes.mts")), true);
  assert.equal(await eslint.isPathIgnored(join(repositoryRoot, "src", "core", "index.ts")), false);
});

// ---------------------------------------------------------------------------------------------------------------
// Allow-list of #59 (T-AC-1 to T-AC-5). Every fixture is linted at a path in src/core and at the matching path in
// src/cli, so the scope of each rule is tested both ways. Paths of the planned modules come from their tasks.

interface Fixture {
  readonly name: string;
  readonly code: string;
  /** Path in src/core; the outside path is the same path under src/cli. */
  readonly path: string;
  readonly rule: string;
}

const outsidePath = (path: string): string => path.replace(/^src\/core\//, "src/cli/");

const importOf = (specifier: string): string => `import * as m from "${specifier}";\nexport const x: unknown = m;\n`;

// Forms that the allow-list (or the new selectors) must reject in src/core.
const REJECTED: readonly Fixture[] = [
  // Relative paths that leave src/core, at depth 1, 2 and 3 and through encodings Node.js resolves.
  { name: "an import of ../cli", code: importOf("../cli/index.js"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "an import of ../../mcp", code: importOf("../../mcp/server.js"), path: "src/core/model/fixture.ts", rule: CORE_IMPORTS },
  { name: "an import of ../../../package.json", code: 'import manifest from "../../../package.json";\nexport const x: unknown = manifest;\n', path: "src/core/text/wrap/fixture.ts", rule: CORE_IMPORTS },
  { name: "an import of ../cli through a percent-encoded dot segment", code: importOf("./%2e%2e/cli/index.js"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "an import into a sibling directory whose name starts with core", code: importOf("../../core-copy/index.js"), path: "src/core/model/fixture.ts", rule: CORE_IMPORTS },
  { name: "a type-only import of ../cli", code: 'import type { Command } from "../cli/index.js";\nexport type X = Command;\n', path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a re-export from ../cli", code: 'export { run } from "../cli/index.js";\n', path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a dynamic import of ../cli by string literal", code: 'export const load = () => import("../cli/index.js");\n', path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a dynamic import of ../cli by template literal", code: "export const load = () => import(`../cli/index.js`);\n", path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a require of ../cli in a .cts file", code: 'export const cli: unknown = require("../cli/index.cjs");\n', path: "src/core/fixture.cts", rule: CORE_IMPORTS },
  // Packages that are not on eslint-rules/core-allowlist.js, standing for process and network helpers.
  ...["cross-spawn", "execa", "node-fetch", "undici", "ws"].map((name) => ({
    name: `the unlisted package ${name}`,
    code: importOf(name),
    path: CORE_FILE,
    rule: CORE_IMPORTS,
  })),
  { name: "export * from an unlisted package", code: 'export * from "cross-spawn";\n', path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "import x = require() of an unlisted package", code: 'import execa = require("execa");\nexport const x: unknown = execa;\n', path: "src/core/fixture.cts", rule: CORE_IMPORTS },
  { name: "an unlisted package in a .mts file", code: importOf("cross-spawn"), path: "src/core/fixture.mts", rule: CORE_IMPORTS },
  { name: "an unlisted package in a .cts file", code: importOf("cross-spawn"), path: "src/core/fixture.cts", rule: CORE_IMPORTS },
  { name: "a package whose name only starts like a listed one", code: importOf("fontkit-extra"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a listed package subpath that climbs into another package", code: importOf("elkjs/../cross-spawn/index.js"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a listed package subpath with an encoded dot segment", code: importOf("fontkit/%2e%2e/ws"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a package-internal import map entry", code: importOf("#internal"), path: CORE_FILE, rule: CORE_IMPORTS },
  // Built-ins outside their grant, without the node: prefix or with a different case, and URLs.
  ...["node:fs", "node:fs/promises", "node:worker_threads", "node:os", "node:path/posix"].map((name) => ({
    name: `${name} in a core file without a grant`,
    code: importOf(name),
    path: CORE_FILE,
    rule: CORE_IMPORTS,
  })),
  { name: "node:fs in src/core/text outside the font loader", code: importOf("node:fs"), path: "src/core/text/measure.ts", rule: CORE_IMPORTS },
  { name: "node:fs in a directory whose name only starts with io", code: importOf("node:fs"), path: "src/core/io-extra/read.ts", rule: CORE_IMPORTS },
  { name: "node:worker_threads in src/core/layout outside the worker files", code: importOf("node:worker_threads"), path: "src/core/layout/index.ts", rule: CORE_IMPORTS },
  { name: "node:worker_threads in a .mts worker file (the grant names .ts files only)", code: importOf("node:worker_threads"), path: "src/core/layout/worker.mts", rule: CORE_IMPORTS },
  { name: "a built-in without the node: prefix", code: importOf("path"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a built-in with an upper-case scheme", code: importOf("NODE:fs"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a data: URL (code in the specifier)", code: 'export const load = () => import("data:text/javascript,export default 1");\n', path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a file: URL", code: importOf("file:///etc/hosts.js"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "an absolute path", code: importOf("/etc/hosts.js"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: "a dynamic import with a computed specifier (allow-list layer)", code: "export const load = (name: string) => import(name);\n", path: CORE_FILE, rule: CORE_IMPORTS },
  // T-AC-2: aliases of process and globalThis, and the Function constructor through a prototype.
  { name: "an alias of process (const p = process; p.getBuiltinModule)", code: 'const p = process;\nexport const load = (): unknown => p.getBuiltinModule("child_process");\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "destructuring of process (const { getBuiltinModule } = process)", code: 'const { getBuiltinModule } = process;\nexport const load = (): unknown => getBuiltinModule("node:child_process");\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "an alias of globalThis (const g = globalThis; g.fetch)", code: 'const g = globalThis;\nexport const load = (): unknown => g.fetch("https://example.invalid");\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: 'a computed member of globalThis (globalThis["fe" + "tch"])', code: 'export const load = (): unknown => globalThis["fe" + "tch"];\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: '(() => {}).constructor("return 1")()', code: 'export const run = (): unknown => (() => {}).constructor("return 1")();\n', path: CORE_FILE, rule: "no-restricted-syntax" },
  // Further forms found while probing #59.
  { name: "the async function constructor through a prototype", code: "export const make = (): unknown => (async () => {}).constructor;\n", path: CORE_FILE, rule: "no-restricted-syntax" },
  { name: "destructuring of constructor", code: "const { constructor: make } = (): void => undefined;\nexport const x: unknown = make;\n", path: CORE_FILE, rule: "no-restricted-syntax" },
  { name: 'the constructor named as a string (Reflect.get(f, "constructor"))', code: 'export const make = (f: () => void): unknown => Reflect.get(f, "constructor");\n', path: CORE_FILE, rule: "no-restricted-syntax" },
  { name: "the constructor named as a template literal", code: "export const make = (f: () => void): unknown => Reflect.get(f, `constructor`);\n", path: CORE_FILE, rule: "no-restricted-syntax" },
  { name: "a member of process that is not allowed (process.mainModule)", code: "export const main = (): unknown => process.mainModule;\n", path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "process.env (determinism: no environment values)", code: 'export const home = (): unknown => process.env["HOME"];\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "an assignment to an allowed member of process", code: 'export const set = (): void => {\n  process.platform = "linux";\n};\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "process passed as an argument (Reflect.get(process, name))", code: "export const load = (name: string): unknown => Reflect.get(process, name);\n", path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "global.process", code: "export const load = (): unknown => global.process;\n", path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "an ambient declaration that hides process", code: 'declare const process: { getBuiltinModule(id: string): unknown };\nconst p = process;\nexport const load = (): unknown => p.getBuiltinModule("node:child_process");\n', path: CORE_FILE, rule: CORE_GLOBALS },
  { name: "module.require in a .cts file", code: 'export const load: unknown = module.require("child_process");\n', path: "src/core/fixture.cts", rule: CORE_GLOBALS },
  { name: "an alias of require in a .cts file", code: 'const load = require;\nexport const cp: unknown = load("node:child_process");\n', path: "src/core/fixture.cts", rule: CORE_GLOBALS },
  { name: "require.call in a .cts file", code: 'export const cp: unknown = require.call(null, "node:child_process");\n', path: "src/core/fixture.cts", rule: CORE_GLOBALS },
  // QA-9 of PR #61: tsc compiles .tsx too, so every rule must reach it.
  { name: "node:child_process in a .tsx file (QA-9 reproduction)", code: 'import { spawnSync } from "node:child_process";\n\nexport const evil = (): unknown => spawnSync("node", ["--version"]);\n', path: "src/core/evil.tsx", rule: CORE_IMPORTS },
  { name: "node:child_process in a .tsx file (deny-list layer)", code: FORBIDDEN_IMPORT, path: "src/core/fixture.tsx", rule: "no-restricted-imports" },
  { name: "an unlisted package in a .tsx file", code: importOf("cross-spawn"), path: "src/core/fixture.tsx", rule: CORE_IMPORTS },
  { name: "an import of ../cli from a .tsx file", code: importOf("../cli/index.js"), path: "src/core/fixture.tsx", rule: CORE_IMPORTS },
  { name: "an alias of process in a .tsx file", code: "const p = process;\nexport const x: unknown = p;\n", path: "src/core/fixture.tsx", rule: CORE_GLOBALS },
  { name: "(() => {}).constructor in a .tsx file", code: "export const run = (): unknown => (() => undefined).constructor;\n", path: "src/core/fixture.tsx", rule: "no-restricted-syntax" },
  { name: "node:fs in a .tsx file outside src/core/io", code: importOf("node:fs"), path: "src/core/text/fonts.tsx", rule: CORE_IMPORTS },
  // Reviews of PR #61: SR-6 (a nested node_modules segment) and the decision of CR-7 (the word is banned as a
  // string too, also in a Set or a type, so that `const k = "constructor"; f[k]` cannot be written).
  { name: "a listed package subpath with a node_modules segment", code: importOf("fontkit/node_modules/ws/index.js"), path: CORE_FILE, rule: CORE_IMPORTS },
  { name: 'the string "constructor" in a Set of reserved keys', code: 'export const reserved = new Set(["constructor", "__proto__"]);\n', path: CORE_FILE, rule: "no-restricted-syntax" },
  { name: 'the string "constructor" in a type', code: 'export type Key = "constructor" | "id";\n', path: CORE_FILE, rule: "no-restricted-syntax" },
  { name: 'the string "constructor" kept in a variable', code: 'const key = "constructor";\nexport const make = (f: () => void): unknown => Reflect.get(f, key);\n', path: CORE_FILE, rule: "no-restricted-syntax" },
];

for (const fixture of REJECTED) {
  test(`src/core rejects ${fixture.name} (${fixture.rule})`, async () => {
    const inCore = await lint(fixture.code, fixture.path);
    assert.ok(inCore.includes(fixture.rule), `expected ${fixture.rule} at ${fixture.path}, got ${JSON.stringify(inCore)}`);
  });

  test(`outside src/core, ${fixture.rule} does not apply to ${fixture.name}`, async () => {
    const path = outsidePath(fixture.path);
    const outside = await lint(fixture.code, path);
    assert.ok(!outside.includes(fixture.rule), `${fixture.rule} must not apply at ${path}, got ${JSON.stringify(outside)}`);
  });
}

// Forms that must stay clean in src/core: no isolation rule (and no other rule) may fire.
const ALLOWED: ReadonlyArray<Omit<Fixture, "rule">> = [
  { name: "a core-internal relative import at depth 1", code: importOf("../model/types.js"), path: "src/core/text/fixture.ts" },
  { name: "a core-internal relative import at depth 3", code: importOf("../../../model/types.js"), path: "src/core/layout/elk/steps/fixture.ts" },
  { name: "a core-internal import of the core entry point", code: importOf("../index.js"), path: "src/core/model/fixture.ts" },
  { name: "a core-internal relative import in a .tsx file", code: importOf("../model/types.js"), path: "src/core/render/fixture.tsx" },
  { name: "node:fs in a .tsx file of src/core/io (#34)", code: importOf("node:fs"), path: "src/core/io/read.tsx" },
  { name: "a core-internal re-export and dynamic import", code: 'export { a } from "./model/types.js";\nexport const load = () => import("./model/types.js");\n', path: CORE_FILE },
  { name: "the listed package fontkit", code: importOf("fontkit"), path: "src/core/text/fonts.ts" },
  { name: "a plain subpath of the listed package elkjs", code: importOf("elkjs/lib/elk.bundled.js"), path: "src/core/layout-elk/run.ts" },
  { name: "the listed scoped package @resvg/resvg-js", code: importOf("@resvg/resvg-js"), path: "src/core/export/png.ts" },
  ...["node:buffer", "node:crypto", "node:path", "node:perf_hooks", "node:url", "node:util"].map((name) => ({
    name: `the core-wide built-in ${name}`,
    code: importOf(name),
    path: CORE_FILE,
  })),
  { name: "node:fs in src/core/io (#34)", code: importOf("node:fs"), path: "src/core/io/read.ts" },
  { name: "node:fs/promises in a nested file of src/core/io (#34)", code: importOf("node:fs/promises"), path: "src/core/io/write/atomic.ts" },
  { name: "node:fs in the font loader of src/core/text (#17)", code: importOf("node:fs"), path: "src/core/text/fonts.ts" },
  { name: "node:fs/promises in the font loader of src/core/text (#17)", code: importOf("node:fs/promises"), path: "src/core/text/fonts.ts" },
  // T-AC-5: #21 adds the worker files with no change to the lint configuration.
  { name: "node:worker_threads in src/core/layout/worker.ts (#21)", code: 'import { parentPort } from "node:worker_threads";\nexport const port = parentPort;\n', path: "src/core/layout/worker.ts" },
  { name: "node:worker_threads in src/core/layout/worker-runner.ts (#21)", code: 'import { Worker } from "node:worker_threads";\nexport const start = (url: URL): Worker => new Worker(url, { resourceLimits: { maxOldGenerationSizeMb: 512 } });\n', path: "src/core/layout/worker-runner.ts" },
  // The globals rule must not be noisy.
  { name: "a direct read of process.platform", code: 'export const windows = (): boolean => process.platform === "win32";\n', path: "src/core/io/read.ts" },
  { name: "a local function named process", code: "const process = (value: number): number => value + 1;\nexport const run = (): number => process(1);\n", path: CORE_FILE },
  { name: "a property named process or globalThis", code: "export const steps = { process: 1, globalThis: 2 };\nexport const read = (o: { process: number }): number => o.process;\n", path: CORE_FILE },
  { name: "process in a type position", code: "export type Platform = typeof process.platform;\n", path: CORE_FILE },
  { name: "a class with a constructor method", code: "export class Box {\n  readonly size: number;\n  constructor(size: number) {\n    this.size = size;\n  }\n}\n", path: CORE_FILE },
];

for (const fixture of ALLOWED) {
  test(`src/core allows ${fixture.name}`, async () => {
    assert.deepEqual(await lint(fixture.code, fixture.path), []);
  });
}

test("src/core allows a core-internal require in a .cts file (only the general no-require-imports rule fires)", async () => {
  const messages = await lint('export const types: unknown = require("./model/types.cjs");\n', "src/core/fixture.cts");
  assert.deepEqual(messages, ["@typescript-eslint/no-require-imports"]);
});

test("T-AC-5: the worker import fails in every other core file, including the worker's neighbours", async () => {
  for (const path of ["src/core/layout/registry.ts", "src/core/layout-elk/worker.ts", "src/core/layout/worker/index.ts", CORE_FILE]) {
    const messages = await lint(importOf("node:worker_threads"), path);
    assert.ok(messages.includes(CORE_IMPORTS), `${path}: ${JSON.stringify(messages)}`);
    assert.ok(messages.includes("no-restricted-imports"), `${path}: the deny-list must still name worker_threads`);
  }
});

// T-AC-3: inline configuration cannot switch off the new rules either (noInlineConfig in the core block).
const INLINE_FIXTURES: ReadonlyArray<readonly [string, string, string]> = [
  ["a file-wide eslint-disable before an import of ../cli", `/* eslint-disable */\n${importOf("../cli/index.js")}`, CORE_IMPORTS],
  ["an eslint-disable-next-line naming the allow-list rule", `// eslint-disable-next-line blueprint-drafter/core-imports\n${importOf("cross-spawn")}`, CORE_IMPORTS],
  ["an eslint-env comment before a forbidden import", `/* eslint-env node */\n${FORBIDDEN_IMPORT}`, "no-restricted-imports"],
  ["an eslint-env comment before an import of node:fs", `/* eslint-env node */\n${importOf("node:fs")}`, CORE_IMPORTS],
  ["a global comment before an alias of process", "/* global process: writable */\nconst p = process;\nexport const x: unknown = p;\n", CORE_GLOBALS],
  ["an eslint-disable comment naming the globals rule", "/* eslint-disable blueprint-drafter/core-globals */\nconst g = globalThis;\nexport const x: unknown = g;\n", CORE_GLOBALS],
  ["an eslint-disable comment naming no-restricted-syntax", "/* eslint-disable no-restricted-syntax */\nexport const run = (): unknown => (() => {}).constructor;\n", "no-restricted-syntax"],
];

for (const [name, code, ruleId] of INLINE_FIXTURES) {
  test(`src/core still applies ${ruleId} behind ${name}`, async () => {
    const inCore = await lint(code, CORE_FILE);
    assert.ok(inCore.includes(ruleId), `expected ${ruleId}, got ${JSON.stringify(inCore)}`);
  });
}

// Residual risk, pinned: lint cannot follow a name that is computed at run time. The throwing stubs catch these
// forms (test/scaffold/core-stubs.test.ts runs the same code under them). If a later change makes lint catch
// one, move it to REJECTED.
const ISOLATION_RULES = [
  CORE_IMPORTS,
  CORE_GLOBALS,
  "no-restricted-syntax",
  "no-restricted-imports",
  "no-restricted-globals",
  "no-restricted-properties",
  "no-eval",
  "no-new-func",
  "no-implied-eval",
];

const RESIDUAL_LINT_FORMS: ReadonlyArray<readonly [string, string]> = [
  ["the Function constructor through a computed property name", 'export const make = (f: () => void): unknown => Reflect.get(f, "constr" + "uctor");\n'],
  ["the Function constructor through property descriptors", "export const make = (): unknown => Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf((): void => undefined)));\n"],
];

for (const [name, code] of RESIDUAL_LINT_FORMS) {
  test(`residual (pinned, caught by the stubs): lint does not see ${name}`, async () => {
    const inCore = await lint(code, CORE_FILE);
    assert.deepEqual(inCore.filter((ruleId) => ISOLATION_RULES.includes(ruleId)), []);
  });
}

test("the allow-list options for src/core are exactly the reviewed lists", async () => {
  const config: unknown = await eslint.calculateConfigForFile(join(repositoryRoot, CORE_FILE));
  const rules = isRecord(config) && isRecord(config["rules"]) ? config["rules"] : {};
  const setting = rules[CORE_IMPORTS];
  assert.ok(Array.isArray(setting), "the allow-list rule must be configured for src/core");
  const options: unknown = setting[1];
  assert.ok(isRecord(options));
  assert.deepEqual(options["nodeModules"], ["node:buffer", "node:crypto", "node:path", "node:perf_hooks", "node:url", "node:util"]);
  assert.deepEqual(options["packages"], ["fontkit", "elkjs", "@resvg/resvg-js"]);
  assert.equal(options["coreDirectory"], join(repositoryRoot, "src", "core"));
});

// O-3 of the QA report on PR #61: allowing another member of process (for example kill) must fail a test.
test("the globals options for src/core are exactly the reviewed members (only process.platform)", async () => {
  const config: unknown = await eslint.calculateConfigForFile(join(repositoryRoot, CORE_FILE));
  const rules = isRecord(config) && isRecord(config["rules"]) ? config["rules"] : {};
  const setting = rules[CORE_GLOBALS];
  assert.ok(Array.isArray(setting), "the globals rule must be configured for src/core");
  const options: unknown = setting[1];
  assert.ok(isRecord(options));
  assert.deepEqual(options["allowedMembers"], { process: ["platform"], globalThis: [], global: [], module: [] });
});

// QA-9 of PR #61: the rules must reach every file that tsc compiles from src/core, as a class, not one extension
// at a time. tsc compiles .ts, .tsx, .mts and .cts (allowJs is off, checked below); the lint globs, the guard's
// discovery and this list must agree, and any other file in src/core fails here.
const coreConfig: unknown = await import(pathToFileURL(join(repositoryRoot, "eslint.config.core.js")).href);

test("the lint extensions of src/core are exactly the extensions tsc compiles and the guard discovers", () => {
  assert.ok(isRecord(coreConfig) && Array.isArray(coreConfig["CORE_SOURCE_EXTENSIONS"]));
  const lintExtensions = coreConfig["CORE_SOURCE_EXTENSIONS"].map((extension: unknown) => `.${String(extension)}`).sort();
  assert.deepEqual(lintExtensions, [...COMPILED_EXTENSIONS.keys()].sort());
  assert.deepEqual(lintExtensions, [".cts", ".mts", ".ts", ".tsx"]);
});

for (const extension of COMPILED_EXTENSIONS.keys()) {
  test(`a ${extension} file anywhere in src/core is linted with every isolation rule`, async () => {
    for (const path of [`src/core/fixture${extension}`, `src/core/io/nested/fixture${extension}`]) {
      const filePath = join(repositoryRoot, path);
      assert.equal(await eslint.isPathIgnored(filePath), false, path);
      const config: unknown = await eslint.calculateConfigForFile(filePath);
      const rules = isRecord(config) && isRecord(config["rules"]) ? config["rules"] : {};
      for (const rule of [CORE_IMPORTS, CORE_GLOBALS, "no-restricted-imports", "no-restricted-syntax", "no-restricted-globals"]) {
        assert.ok(Array.isArray(rules[rule]) && rules[rule][0] === 2, `${rule} is not an error at ${path}`);
      }
    }
  });
}

test("every file under src/core has an extension that tsc compiles and lint covers", () => {
  const uncovered = (directory: string): string[] =>
    listFiles(directory)
      .filter((file) => !COMPILED_EXTENSIONS.has(extname(file)))
      .map((file) => relative(directory, file).split(sep).join("/"));
  assert.deepEqual(uncovered(join(repositoryRoot, "src", "core")), []);
  // Negative control: JavaScript and other files would escape lint and the guard, so they are reported.
  const tree = mkdtempSync(join(tmpdir(), "blueprint-drafter-extensions-"));
  try {
    for (const file of ["ok.ts", "ok.tsx", "types.d.ts", "a.js", "b/c.mjs", "d.cjs", "e.jsx", "f.json"]) {
      mkdirSync(join(tree, file, ".."), { recursive: true });
      writeFileSync(join(tree, file), "");
    }
    assert.deepEqual(uncovered(tree), ["a.js", "b/c.mjs", "d.cjs", "e.jsx", "f.json"]);
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
});

test("src/core holds no symbolic link, which lint, the guard and the extension check would not follow (SR-2)", () => {
  assert.deepEqual(listSymbolicLinks(join(repositoryRoot, "src", "core")), []);
  // Negative control: a directory link (a junction on Windows, which needs no privilege) is reported.
  const tree = mkdtempSync(join(tmpdir(), "blueprint-drafter-links-"));
  try {
    mkdirSync(join(tree, "real"));
    symlinkSync(join(tree, "real"), join(tree, "linked"), "junction");
    assert.deepEqual(listSymbolicLinks(tree).map((file) => relative(tree, file)), ["linked"]);
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
});

// Residual risk 12 (SR-4 of PR #61), pinned: grants are per module, so lint cannot see these uses. Review keeps
// them out (node:crypto for hashing only; the worker of #21 without eval: true). If a rule learns to reject one,
// move it to REJECTED.
const RESIDUAL_GRANT_FORMS: ReadonlyArray<readonly [string, string, string]> = [
  ["randomUUID from node:crypto (not hashing)", 'import { randomUUID } from "node:crypto";\nexport const id = (): string => randomUUID();\n', CORE_FILE],
  ["a Worker with eval: true in the granted runner", 'import { Worker } from "node:worker_threads";\nexport const start = (code: string): Worker => new Worker(code, { eval: true });\n', "src/core/layout/worker-runner.ts"],
];

for (const [name, code, path] of RESIDUAL_GRANT_FORMS) {
  test(`residual 12 (pinned): lint allows ${name}`, async () => {
    const inCore = await lint(code, path);
    assert.deepEqual(inCore.filter((ruleId) => ISOLATION_RULES.includes(ruleId)), []);
  });
}

test("no tsconfig enables allowJs or checkJs (tsc would then compile .js and .jsx files that lint does not cover)", () => {
  const configs = readdirSync(repositoryRoot).filter((name) => /^tsconfig.*\.json$/.test(name));
  assert.ok(configs.includes("tsconfig.json") && configs.includes("tsconfig.build.json"));
  for (const name of configs) {
    const options = readJson(name)["compilerOptions"];
    const compilerOptions = isRecord(options) ? options : {};
    assert.notEqual(compilerOptions["allowJs"], true, `${name} enables allowJs`);
    assert.notEqual(compilerOptions["checkJs"], true, `${name} enables checkJs`);
  }
});
