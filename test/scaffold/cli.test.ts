import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

import { readJson, repositoryRoot } from "./helpers.js";

// `npm test` compiles src/ and test/ into dist-test/ with tsc first, so the bin under test is compiled JavaScript.
const bin = join(repositoryRoot, "dist-test", "src", "cli", "index.js");

function runBin(...args: string[]) {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  return result;
}

test("--version prints the package version and exits 0", () => {
  const version = readJson("package.json")["version"];
  assert.equal(typeof version, "string");
  const result = runBin("--version");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${String(version)}\n`);
  assert.equal(result.stderr, "");
});

test("--help prints the usage text and exits 0", () => {
  const result = runBin("--help");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: blueprint-drafter /);
  assert.match(result.stdout, /--version/);
  assert.match(result.stdout, /--help/);
  assert.equal(result.stderr, "");
});

test("no argument is a usage error with exit code 2", () => {
  const result = runBin();
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /no command given/);
  assert.match(result.stderr, /Usage: blueprint-drafter /);
});

test("an unknown argument is a usage error with exit code 2", () => {
  const result = runBin("--frobnicate");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown argument: --frobnicate/);
});
