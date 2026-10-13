import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import { repositoryRoot } from "./helpers.js";

async function loadCoreIsolation(): Promise<Linter.Config[]> {
  const url = pathToFileURL(join(repositoryRoot, "eslint.config.core.js")).href;
  const loaded: unknown = await import(url);
  assert.ok(typeof loaded === "object" && loaded !== null && "coreIsolation" in loaded);
  assert.ok(Array.isArray(loaded.coreIsolation));
  // The file is plain JavaScript: ESLint itself validates the shape of these objects when it uses them.
  const coreIsolation: unknown[] = loaded.coreIsolation;
  return coreIsolation as Linter.Config[];
}

async function lint(code: string, filename: string): Promise<string[]> {
  const config: Linter.Config[] = [
    { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
    ...(await loadCoreIsolation()),
  ];
  const messages = new Linter({ cwd: repositoryRoot, configType: "flat" }).verify(code, config, { filename });
  const fatal = messages.filter((message) => message.fatal === true);
  assert.deepEqual(fatal, [], "the fixture must parse");
  return messages.map((message) => message.ruleId ?? "parse-error");
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
  ["require of node:child_process", 'declare function require(id: string): unknown;\nexport const load = require("node:child_process");\n', "no-restricted-syntax"],
  ["dynamic import of node:child_process", 'export const load = () => import("node:child_process");\n', "no-restricted-syntax"],
  ["call of eval", "export const run = (source: string): unknown => eval(source);\n", "no-eval"],
  ["new Function", "export const make = (body: string): unknown => new Function(body);\n", "no-new-func"],
  ["call of fetch", 'export const load = () => fetch("https://example.invalid");\n', "no-restricted-globals"],
];

for (const [name, code, ruleId] of FORBIDDEN) {
  test(`src/core rejects ${name}`, async () => {
    const inCore = await lint(code, CORE_FILE);
    assert.ok(inCore.includes(ruleId), `expected ${ruleId}, got ${JSON.stringify(inCore)}`);
  });

  test(`the same code outside src/core is not rejected for ${name}`, async () => {
    const outside = await lint(code, OUTSIDE_FILE);
    assert.deepEqual(outside, []);
  });
}

test("a module whose name only starts like a forbidden one is allowed in src/core", async () => {
  const code = 'import { x } from "net-utils";\nexport const y = x;\n';
  assert.deepEqual(await lint(code, CORE_FILE), []);
});

test("clean code in src/core passes", async () => {
  const code = 'import { join } from "node:path";\nexport const path = (name: string): string => join("a", name);\n';
  assert.deepEqual(await lint(code, CORE_FILE), []);
});
