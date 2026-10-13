import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isRecord, readJson, readText, repositoryRoot } from "./helpers.js";

function section(name: string): Record<string, unknown> {
  const value = readJson("package.json")[name];
  assert.ok(isRecord(value), `package.json has no object "${name}"`);
  return value;
}

test("package.json describes one ESM package with one binary (ADR-0007)", () => {
  const manifest = readJson("package.json");
  assert.equal(manifest["name"], "blueprint-drafter");
  assert.equal(manifest["type"], "module");
  assert.equal(manifest["license"], "Apache-2.0");
  assert.deepEqual(section("engines"), { node: ">=22" });
  assert.deepEqual(section("bin"), { "blueprint-drafter": "dist/cli/index.js" });
  assert.deepEqual(Object.keys(section("exports")), ["."]);
  assert.ok(Array.isArray(manifest["files"]));
});

test("package.json has the scripts of the toolchain", () => {
  const scripts = section("scripts");
  for (const name of ["build", "lint", "typecheck", "test"]) {
    assert.equal(typeof scripts[name], "string", `missing script ${name}`);
  }
});

test("no package.json script uses a shell-specific construct (NFR-12)", () => {
  const shellSpecific = /[|&;<>$`~*]|^\s*[A-Za-z_]+=|\b(rm|cp|mv|cat|echo|export|set|env|mkdir|touch)\s/;
  for (const [name, command] of Object.entries(section("scripts"))) {
    assert.equal(typeof command, "string");
    // Double-quoted arguments of node itself (a glob or an inline script) are fine; strip them before the check.
    const outsideQuotes = String(command).replace(/"(?:[^"\\]|\\.)*"/g, '""');
    assert.doesNotMatch(outsideQuotes, shellSpecific, `script ${name} uses a shell-specific construct`);
  }
});

test("runtime and development dependencies are pinned exactly (ADR-0005, architecture 6.6)", () => {
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(section(group))) {
      assert.match(String(range), /^\d+\.\d+\.\d+$/, `${group}.${name} is not an exact version`);
    }
  }
  const runtime = Object.keys(section("dependencies")).sort();
  assert.deepEqual(runtime, ["@modelcontextprotocol/sdk", "@resvg/resvg-js", "elkjs", "fontkit", "zod"]);
});

test(".gitattributes fixes line endings to LF", () => {
  assert.match(readText(".gitattributes"), /^\* text=auto eol=lf$/m);
});

test(".github has the templates and code owners but no workflows (#2 owns them)", () => {
  assert.ok(existsSync(join(repositoryRoot, ".github", "pull_request_template.md")));
  assert.equal(existsSync(join(repositoryRoot, ".github", "ISSUE_TEMPLATE", "config.yml")), false);
  const forms = readdirSync(join(repositoryRoot, ".github", "ISSUE_TEMPLATE")).filter((file) => file.endsWith(".yml"));
  assert.ok(forms.length > 0);
  assert.match(readText(".github", "CODEOWNERS"), /^\* @eliangilsierra$/m);
  assert.equal(existsSync(join(repositoryRoot, ".github", "workflows")), false);
});

test("AGENTS.md lists the exact commands and CLAUDE.md imports it", () => {
  const agents = readText("AGENTS.md");
  for (const command of ["npm ci", "npm run lint", "npm run typecheck", "npm run build", "npm test"]) {
    assert.ok(agents.includes(`\`${command}\``), `AGENTS.md does not mention \`${command}\``);
  }
  assert.match(readText("CLAUDE.md"), /^@AGENTS\.md$/m);
});
