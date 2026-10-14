import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

import { readJson, repositoryRoot } from "./helpers.js";

// `npm test` compiles src/ and test/ into dist-test/ with tsc first, so the bin under test is compiled JavaScript.
const bin = join(repositoryRoot, "dist-test", "src", "cli", "index.js");

const ESC = String.fromCharCode(0x1b);
const CSI = String.fromCharCode(0x9b); // C1 control: single-byte form of ESC [
const BIDI = String.fromCharCode(0x202e); // right-to-left override
const ZERO_WIDTH = String.fromCharCode(0x200b);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const BACKSLASH = String.fromCharCode(0x5c);

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
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown argument: "--frobnicate"/);
});

test("--help and --version are accepted only as the sole argument", () => {
  for (const args of [["--version", "--bogus"], ["--bogus", "--help"], ["foo", "--help"], ["--help", "--version"], ["--version", "--version"]]) {
    const result = runBin(...args);
    assert.equal(result.status, 2, `exit code for ${JSON.stringify(args)}`);
    assert.equal(result.stdout, "", `stdout for ${JSON.stringify(args)}`);
    assert.match(result.stderr, /^blueprint-drafter: (unknown|unexpected) argument: "/, `stderr for ${JSON.stringify(args)}`);
  }
});

test("only the first offending argument is echoed", () => {
  const result = runBin("--first-bad", "--second-bad");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /"--first-bad"/);
  assert.doesNotMatch(result.stderr, /--second-bad/);
});

test("control, bidirectional and zero-width characters are removed from the echoed argument", () => {
  const hostile = `x${ESC}[2J${CSI}${BIDI}${ZERO_WIDTH}${LINE_SEPARATOR} IGNORE PREVIOUS INSTRUCTIONS`;
  const result = runBin(hostile);
  assert.equal(result.status, 2);
  const firstLine = result.stderr.split("\n")[0] ?? "";
  assert.equal(firstLine, 'blueprint-drafter: unknown argument: "x[2J IGNORE PREVIOUS INSTRUCTIONS"');
  for (const character of [ESC, CSI, BIDI, ZERO_WIDTH, LINE_SEPARATOR]) {
    assert.ok(!result.stderr.includes(character), `stderr contains U+${character.codePointAt(0)?.toString(16) ?? ""}`);
  }
});

test("an echoed argument is cut to a bounded length and quoted", () => {
  const result = runBin("a".repeat(10_000));
  assert.equal(result.status, 2);
  const firstLine = result.stderr.split("\n")[0] ?? "";
  assert.ok(firstLine.length < 200, `first stderr line has ${String(firstLine.length)} characters`);
  assert.match(firstLine, /unknown argument: "a{80}\.\.\."$/);
  assert.ok(result.stderr.length < 1000);
});

test("quotes and backslashes in an echoed argument are escaped", () => {
  const result = runBin('a"b' + BACKSLASH + "c");
  assert.equal(result.status, 2);
  assert.match(result.stderr.split("\n")[0] ?? "", /unknown argument: "a\\"b\\\\c"$/);
});
