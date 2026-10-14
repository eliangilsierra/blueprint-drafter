import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

import { repositoryRoot } from "./helpers.js";

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

test("a module whose name only starts like a forbidden one is allowed in src/core", async () => {
  const code = 'import { x } from "net-utils";\nexport const y = x;\n';
  assert.deepEqual(await lint(code, CORE_FILE), []);
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
