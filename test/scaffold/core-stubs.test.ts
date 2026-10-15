// AC-44, core layer (issue #59): every module under src/core is imported, and every core function that can already
// run on a corpus case is called, with the throwing stubs of support/forbidden-apis.ts installed. No process,
// socket, network call, file write or code evaluation may be attempted. Self-tests prove that the guard fails on a
// module that does any of these things, so it cannot pass silently.

import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { isRecord, repositoryRoot } from "./helpers.js";
import {
  ForbiddenApiError,
  assertNoForbiddenCalls,
  installForbiddenApiStubs,
  runUnderStubs,
} from "./support/forbidden-apis.js";

const SOURCE_EXTENSIONS = new Map([
  [".ts", ".js"],
  [".mts", ".mjs"],
  [".cts", ".cjs"],
]);

/** Source files under a directory, at any depth, without declaration files (discovered at run time). */
function discoverSources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    const extension = [...SOURCE_EXTENSIONS.keys()].find((candidate) => entry.name.endsWith(candidate));
    if (entry.isFile() && extension !== undefined && !/\.d\.[mc]?ts$/.test(entry.name)) {
      found.push(join(entry.parentPath, entry.name));
    }
  }
  return found.sort();
}

const sourceCore = join(repositoryRoot, "src", "core");
// This file runs from dist-test/test/scaffold/, the compiled core is dist-test/src/core/.
const compiledCore = fileURLToPath(new URL("../../src/core/", import.meta.url));

function compiledPath(source: string): string {
  const rest = relative(sourceCore, source);
  const extension = [...SOURCE_EXTENSIONS.keys()].find((candidate) => rest.endsWith(candidate)) ?? ".ts";
  return join(compiledCore, rest.slice(0, -extension.length) + (SOURCE_EXTENSIONS.get(extension) ?? ".js"));
}

/** Files that the lint grant of #21 allows to use node:worker_threads, as compiled files. */
const workerCallers = ["layout/worker.ts", "layout/worker-runner.ts"].map((file) => compiledPath(join(sourceCore, file)));

const scratch = mkdtempSync(join(tmpdir(), "blueprint-drafter-stubs-"));
after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let fixtureCount = 0;
function writeFixture(code: string): string {
  fixtureCount += 1;
  const file = join(scratch, `fixture-${fixtureCount}.mjs`);
  writeFileSync(file, code);
  return pathToFileURL(file).href;
}

// --- The installer ------------------------------------------------------------------------------------------------

const PROBES: ReadonlyArray<readonly [string, () => unknown]> = [
  ["child_process.spawn", () => childProcess.spawn(process.execPath, ["--version"])],
  ["child_process.execFileSync", () => childProcess.execFileSync(process.execPath, ["--version"])],
  ["net.connect", () => net.connect(9, "127.0.0.1")],
  ["net.Socket", () => new net.Socket()],
  ["fs.writeFileSync", () => {
    fs.writeFileSync(join(scratch, "probe.txt"), "x");
  }],
  ["fs/promises.writeFile", () => fsPromises.writeFile(join(scratch, "probe.txt"), "x")],
  ["fs.openSync (write flags)", () => fs.openSync(join(scratch, "probe.txt"), "w")],
  ["fs.mkdirSync", () => {
    fs.mkdirSync(join(scratch, "probe-directory"));
  }],
  ["fs.createWriteStream", () => fs.createWriteStream(join(scratch, "probe.txt"))],
  ["globalThis.fetch", () => globalThis.fetch("http://127.0.0.1:9/")],
  ["worker_threads.Worker", () => new Worker("", { eval: true })],
  ["Function", () => Reflect.construct(Reflect.get(() => undefined, "constr" + "uctor") as FunctionConstructor, ["return 1"])],
];

for (const [api, probe] of PROBES) {
  test(`the stubs make ${api} throw and report it`, async () => {
    const { calls, error } = await runUnderStubs(probe);
    assert.ok(error instanceof ForbiddenApiError, `expected ForbiddenApiError, got ${String(error)}`);
    assert.equal(error.api, api);
    assert.deepEqual(calls.map((call) => call.api), [api]);
    assert.equal(calls[0]?.caller, fileURLToPath(import.meta.url), "the report names the calling file");
  });
}

test("the stubs cover the process, network, write and code-evaluation APIs of AC-44", () => {
  const stubs = installForbiddenApiStubs();
  const stubbed = new Set(stubs.stubbed);
  stubs.uninstall();
  for (const api of [
    "child_process.spawn",
    "child_process.exec",
    "child_process.fork",
    "net.createServer",
    "http.request",
    "http.get",
    "https.request",
    "http2.connect",
    "dgram.createSocket",
    "dns.lookup",
    "dns/promises.lookup",
    "tls.connect",
    "vm.runInNewContext",
    "cluster.fork",
    "worker_threads.Worker",
    "fs.writeFile",
    "fs.appendFileSync",
    "fs.rmSync",
    "fs.renameSync",
    "fs/promises.writeFile",
    "fs/promises.open (write flags)",
    "globalThis.fetch",
    "globalThis.WebSocket",
    "eval",
    "Function",
    "AsyncFunction",
    "process.binding",
  ]) {
    assert.ok(stubbed.has(api), `${api} is not stubbed`);
  }
});

test("reads stay possible under the stubs, and uninstall restores every original", async () => {
  const originals = [childProcess.spawn, fs.writeFileSync, fsPromises.writeFile, net.connect, globalThis.fetch, Worker];
  const { calls, error } = await runUnderStubs(() => {
    assert.ok(readFileSync(join(repositoryRoot, "package.json"), "utf8").includes("blueprint-drafter"));
    fs.closeSync(fs.openSync(join(repositoryRoot, "package.json"), "r"));
    assert.ok(net.Socket.prototype instanceof Object, "static members of a stubbed class can still be read");
    assert.notEqual(childProcess.spawn, originals[0], "the ES module binding sees the stub");
  });
  assert.equal(error, undefined);
  assert.deepEqual(calls, []);
  assert.deepEqual([childProcess.spawn, fs.writeFileSync, fsPromises.writeFile, net.connect, globalThis.fetch, Worker], originals);
  assert.equal((() => undefined).constructor, Function);
});

test("the stubs can be installed only once at a time", () => {
  const stubs = installForbiddenApiStubs();
  try {
    assert.throws(() => installForbiddenApiStubs(), /already installed/);
  } finally {
    stubs.uninstall();
  }
});

test("allowWrites (tests of src/core/io, #34) leaves writes in place but still stops processes", async () => {
  const target = join(scratch, "allowed-write.txt");
  const { calls, error } = await runUnderStubs(() => {
    fs.writeFileSync(target, "written");
    childProcess.spawn(process.execPath, ["--version"]);
  }, { allowWrites: true });
  assert.equal(readFileSync(target, "utf8"), "written");
  assert.ok(error instanceof ForbiddenApiError);
  assert.deepEqual(calls.map((call) => call.api), ["child_process.spawn"]);
});

test("workerCallers (the grant of #21) lets only the granted file start a worker thread", async () => {
  const code = 'import { Worker } from "node:worker_threads";\nexport const start = () => new Worker("", { eval: true });\n';
  const allowedUrl = writeFixture(code);
  const deniedUrl = writeFixture(code);
  const allowed: unknown = await import(allowedUrl);
  const denied: unknown = await import(deniedUrl);
  assert.ok(isRecord(allowed) && typeof allowed["start"] === "function" && isRecord(denied) && typeof denied["start"] === "function");
  const startAllowed = allowed["start"] as () => Worker;
  const startDenied = denied["start"] as () => Worker;
  let worker: Worker | undefined;
  const result = await runUnderStubs(() => {
    worker = startAllowed();
    startDenied();
  }, { workerCallers: [fileURLToPath(allowedUrl)] });
  assert.ok(worker instanceof Worker, "the granted file started a worker");
  await worker.terminate();
  assert.ok(result.error instanceof ForbiddenApiError);
  assert.deepEqual(result.calls.map((call) => [call.api, call.caller]), [["worker_threads.Worker", fileURLToPath(deniedUrl)]]);
});

// --- (c) Self-test: the guard fails on a module that does forbidden things --------------------------------------

test("self-test: a module that spawns, opens a socket, writes a file and fetches makes the guard fail", async () => {
  const written = join(scratch, "self-test-written.txt");
  const url = writeFixture(
    [
      'import { spawn } from "node:child_process";',
      'import { connect } from "node:net";',
      'import { writeFileSync } from "node:fs";',
      "const attempt = (action) => { try { action(); } catch { /* swallowed on purpose: the report still sees it */ } };",
      'attempt(() => spawn(process.execPath, ["--version"]));',
      'attempt(() => connect(9, "127.0.0.1"));',
      `attempt(() => writeFileSync(${JSON.stringify(written)}, "x"));`,
      'await Promise.resolve().then(() => fetch("http://127.0.0.1:9/")).catch(() => undefined);',
      "",
    ].join("\n"),
  );
  const { calls } = await runUnderStubs(() => import(url));
  assert.deepEqual(calls.map((call) => call.api), ["child_process.spawn", "net.connect", "fs.writeFileSync", "globalThis.fetch"]);
  assert.throws(() => {
    assertNoForbiddenCalls(calls, "the fixture");
  }, /the fixture used forbidden APIs: child_process\.spawn .*net\.connect .*fs\.writeFileSync .*globalThis\.fetch/);
  assert.throws(() => readFileSync(written), { code: "ENOENT" }, "the stub stopped the write");
});

// T-AC-2 at run time: the alias forms are rejected by lint (core-isolation.test.ts); the stubs catch them too, and
// they catch the residual forms that lint cannot see.
const RUNTIME_FORMS: ReadonlyArray<readonly [string, string, string]> = [
  ["const p = process; p.getBuiltinModule(...)", 'const p = process;\np.getBuiltinModule("node:child_process").spawn(process.execPath, ["--version"]);\n', "child_process.spawn"],
  ["const { getBuiltinModule } = process", 'const { getBuiltinModule } = process;\ngetBuiltinModule("node:child_process").execSync("exit 0");\n', "child_process.execSync"],
  ["const g = globalThis; g.fetch(...)", 'const g = globalThis;\nawait g.fetch("http://127.0.0.1:9/").catch(() => undefined);\n', "globalThis.fetch"],
  ['globalThis["fe" + "tch"](...)', 'await globalThis["fe" + "tch"]("http://127.0.0.1:9/").catch(() => undefined);\n', "globalThis.fetch"],
  ['(() => {}).constructor("return 1")()', '(() => {}).constructor("return 1")();\n', "Function"],
  ['residual: Reflect.get(f, "constr" + "uctor")', 'Reflect.get(() => {}, "constr" + "uctor")("return 1");\n', "Function"],
  ["residual: the constructor through property descriptors", 'const found = Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(async () => {}))).find((d) => typeof d.value === "function");\nfound.value("return 1");\n', "AsyncFunction"],
  ["residual: a computed module name in a dependency", 'const { createRequire } = await import("node:module");\nconst load = createRequire(import.meta.url);\nload("child_" + "process").execFileSync(process.execPath, ["--version"]);\n', "child_process.execFileSync"],
];

for (const [name, code, api] of RUNTIME_FORMS) {
  test(`the stubs catch ${name} at run time`, async () => {
    const url = writeFixture(`try {\n${code}} catch {\n  // swallowed on purpose: the report still sees it\n}\n`);
    const { calls } = await runUnderStubs(() => import(url));
    assert.deepEqual(calls.map((call) => call.api), [api]);
  });
}

// --- (a) Every module under src/core, imported under the stubs ---------------------------------------------------

const coreSources = discoverSources(sourceCore);

test("discovery finds .ts, .mts and .cts sources at any depth and skips declaration files", () => {
  const tree = join(scratch, "discovery");
  for (const file of ["a.ts", "b/c.mts", "b/d/e.cts", "types.d.ts", "f.d.mts", "notes.md"]) {
    fs.mkdirSync(join(tree, file, ".."), { recursive: true });
    writeFileSync(join(tree, file), "");
  }
  assert.deepEqual(
    discoverSources(tree).map((file) => relative(tree, file).split(sep).join("/")),
    ["a.ts", "b/c.mts", "b/d/e.cts"],
  );
  assert.ok(coreSources.includes(join(sourceCore, "index.ts")), "src/core/index.ts is discovered");
});

for (const source of coreSources) {
  const name = relative(repositoryRoot, source).split(sep).join("/");
  test(`AC-44: importing ${name} under the throwing stubs attempts nothing forbidden`, async () => {
    const compiled = compiledPath(source);
    assert.ok(fs.existsSync(compiled), `${name} has no compiled file at ${relative(repositoryRoot, compiled)}`);
    const { calls, error } = await runUnderStubs(() => import(pathToFileURL(compiled).href), { workerCallers });
    assertNoForbiddenCalls(calls, name);
    assert.equal(error, undefined, `importing ${name} threw: ${String(error)}`);
  });
}

// --- (b) Core functions that can run on a corpus case ------------------------------------------------------------

function readCorpus(): ReadonlyArray<readonly [string, string]> {
  const directory = join(repositoryRoot, "bench", "cases");
  return readdirSync(directory)
    .filter((file) => file.endsWith(".bpd"))
    .sort()
    .map((file) => [file, readFileSync(join(directory, file), "utf8")] as const);
}

test("AC-44: the core entry points that can run on a corpus case attempt nothing forbidden", async (t) => {
  const corpus = readCorpus();
  assert.ok(corpus.length > 0, "bench/cases has no .bpd case");
  const operations = readFileSync(join(repositoryRoot, "bench", "cases", "08-incremental.ops"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"));
  const exercised = new Set<string>();
  const notes: string[] = [];

  const { calls, error } = await runUnderStubs(async () => {
    const loaded: unknown = await import(pathToFileURL(compiledPath(join(sourceCore, "index.ts"))).href);
    const api = isRecord(loaded) ? loaded : {};
    // Calls a public function of API v1 (architecture section 7.1) when the core exports it already. An error
    // other than a forbidden call is noted, not failed: this guard is about isolation, the module's own tests
    // cover its behaviour.
    const call = async (name: string, ...args: unknown[]): Promise<unknown> => {
      const fn = api[name];
      if (typeof fn !== "function") {
        return undefined;
      }
      exercised.add(name);
      try {
        return await (fn as (...values: unknown[]) => unknown)(...args);
      } catch (thrown: unknown) {
        if (thrown instanceof ForbiddenApiError) {
          throw thrown;
        }
        notes.push(`${name}: ${String(thrown)}`);
        return undefined;
      }
    };
    const field = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);
    for (const [file, text] of corpus) {
      const diagram = field(await call("parse", text), "diagram");
      if (diagram === undefined) {
        continue;
      }
      await call("serialize", diagram);
      await call("show", diagram);
      await call("diff", diagram, diagram);
      if (file === "08-before.bpd") {
        await call("applyOps", diagram, operations);
      }
      const checked = await call("check", diagram);
      await call("formatDiagnostics", checked);
      const layout = field(checked, "layout") ?? field(await call("layout", diagram), "layout");
      if (layout === undefined) {
        continue;
      }
      await call("validate", diagram, layout);
      const svg = await call("renderSvg", layout);
      if (typeof svg === "string") {
        await call("toPng", svg);
      }
      for (const format of ["mermaid", "drawio", "excalidraw"]) {
        await call("exportDiagram", diagram, layout, format);
      }
    }
  }, { workerCallers });

  assertNoForbiddenCalls(calls, "the core entry points");
  assert.equal(error, undefined, `the corpus run threw: ${String(error)}`);
  if (exercised.size === 0) {
    t.diagnostic(`no core function runs on a corpus case yet (src/core/index.ts exports constants only); ${corpus.length} cases are ready`);
  } else {
    t.diagnostic(`exercised on ${corpus.length} corpus cases: ${[...exercised].sort().join(", ")}`);
  }
  for (const note of notes) {
    t.diagnostic(`not an isolation finding: ${note}`);
  }
});
