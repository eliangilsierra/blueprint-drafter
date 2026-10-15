// T-AC-4 (NFR-10, NFR-11; issue #59): the third-party packages of src/core are reviewed. The review runs offline
// and statically over the real tree (after `npm ci --ignore-scripts`) and over small fixture trees that show it
// fails, naming the package, entry or file, for each kind of problem.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { isRecord, repositoryRoot } from "./helpers.js";
import { reviewCoreDependencies, scanText } from "./support/dependency-review.js";

async function loadExport(file: string, name: string): Promise<unknown> {
  const loaded: unknown = await import(pathToFileURL(join(repositoryRoot, file)).href);
  assert.ok(isRecord(loaded) && name in loaded, `${file} does not export ${name}`);
  return loaded[name];
}

const realAllowlist = await loadExport("eslint-rules/core-allowlist.js", "corePackages");
const forbiddenExport = await loadExport("eslint.config.core.js", "FORBIDDEN_MODULES");
assert.ok(Array.isArray(forbiddenExport));
const forbiddenModules = forbiddenExport.filter((name): name is string => typeof name === "string");

test("the real tree passes the review: every core import is listed, scanned and free of install scripts", (t) => {
  const review = reviewCoreDependencies({ root: repositoryRoot, allowlist: realAllowlist, forbiddenModules });
  assert.deepEqual(review.problems, []);
  assert.ok(review.scannedPackages >= 15, `only ${review.scannedPackages} packages were scanned; is node_modules installed?`);
  t.diagnostic(`scanned ${review.scannedPackages} packages, ${review.scannedFiles} files; planned, not imported yet: ${review.planned.join(", ") || "none"}`);
});

test("the scan list is the deny-list of eslint.config.core.js", () => {
  assert.ok(forbiddenModules.includes("child_process") && forbiddenModules.includes("vm") && forbiddenModules.includes("cluster"));
  for (const name of ["net", "http", "https", "dgram", "dns", "tls"]) {
    assert.ok(forbiddenModules.includes(name), name);
  }
});

test("the scan finds every import form and node: prefix and ignores look-alike names", () => {
  const source = [
    'const a = require("child_process");',
    "const b = require ( 'node:net' );",
    'import c from "node:http";',
    'export * from "dns/promises";',
    "const d = await import(`vm`);",
    'import "tls";',
    "process.binding('spawn_sync');",
    'process.getBuiltinModule("os");',
    'const e = require("net-utils"); const f = require("httpx"); const g = "child_process";',
  ].join("\n");
  assert.deepEqual(scanText(source, forbiddenModules), [
    "child_process",
    "dns",
    "http",
    "net",
    "process.binding",
    "process.getBuiltinModule",
    "tls",
    "vm",
  ]);
});

// --- Fixture trees ------------------------------------------------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), "blueprint-drafter-deps-"));
after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface FixturePackage {
  readonly version: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly hasInstallScript?: boolean;
  readonly installed?: boolean;
  readonly optional?: boolean;
}

interface FixtureTree {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly packages: Readonly<Record<string, FixturePackage>>;
  readonly core: Readonly<Record<string, string>>;
}

let treeCount = 0;
function writeTree(tree: FixtureTree): string {
  treeCount += 1;
  const root = join(scratch, `tree-${treeCount}`);
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  write(join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies: tree.dependencies }));
  const lockPackages: Record<string, unknown> = { "": { dependencies: tree.dependencies } };
  for (const [key, pkg] of Object.entries(tree.packages)) {
    lockPackages[key] = {
      version: pkg.version,
      ...(pkg.dependencies === undefined ? {} : { dependencies: pkg.dependencies }),
      ...(pkg.hasInstallScript === true ? { hasInstallScript: true } : {}),
      ...(pkg.optional === true ? { optional: true } : {}),
    };
    if (pkg.installed === false) {
      continue;
    }
    const directory = join(root, ...key.split("/"));
    write(join(directory, "package.json"), JSON.stringify({ name: key.slice(key.lastIndexOf("node_modules/") + 13), version: pkg.version, scripts: pkg.scripts ?? {} }));
    for (const [file, content] of Object.entries(pkg.files ?? { "index.js": "module.exports = 1;\n" })) {
      write(join(directory, file), content);
    }
  }
  write(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: lockPackages }));
  for (const [file, content] of Object.entries(tree.core)) {
    write(join(root, "src", "core", file), content);
  }
  return root;
}

const entry = (name: string, version: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name,
  version,
  task: "#17",
  reason: "fixture",
  licence: "MIT",
  reviewed: "2026-10-14",
  review: "fixture",
  exceptions: [],
  ...extra,
});

const cleanTree: FixtureTree = {
  dependencies: { "good-lib": "1.0.0", "other-lib": "2.0.0" },
  packages: {
    "node_modules/good-lib": { version: "1.0.0", dependencies: { helper: "^3.0.0" } },
    "node_modules/helper": { version: "3.1.0" },
    "node_modules/other-lib": { version: "2.0.0" },
  },
  core: { "text/fonts.ts": 'import lib from "good-lib/sub/path.js";\nimport { join } from "node:path";\nimport { a } from "../model/a.js";\nexport const x = [lib, join, a];\n' },
};

function review(tree: FixtureTree, allowlist: unknown): readonly string[] {
  return reviewCoreDependencies({ root: writeTree(tree), allowlist, forbiddenModules }).problems;
}

function assertOneProblem(problems: readonly string[], ...parts: readonly string[]): void {
  assert.equal(problems.length, 1, JSON.stringify(problems));
  for (const part of parts) {
    assert.ok(problems[0]?.includes(part), `"${problems[0] ?? ""}" does not name ${part}`);
  }
}

test("fixture: a clean tree passes, and a listed package that no core file imports is planned", () => {
  const result = reviewCoreDependencies({ root: writeTree(cleanTree), allowlist: [entry("good-lib", "1.0.0"), entry("other-lib", "2.0.0", { task: "#30" })], forbiddenModules });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.planned, ["other-lib (#30)"]);
  assert.equal(result.scannedPackages, 3);
});

test("fixture: a core file that imports an installed package that is not listed fails and names it", () => {
  const tree: FixtureTree = { ...cleanTree, core: { ...cleanTree.core, "export/png.ts": 'import o from "other-lib";\nexport const y = o;\n' } };
  assertOneProblem(review(tree, [entry("good-lib", "1.0.0")]), "src/core/export/png.ts", '"other-lib"', "not on eslint-rules/core-allowlist.js");
});

test("fixture: an unlisted import in a .tsx, .mts or .cts core file is reported too (CR-2 of PR #61)", () => {
  for (const file of ["view/badge.tsx", "model/data.mts", "legacy/load.cts"]) {
    const tree: FixtureTree = { ...cleanTree, core: { ...cleanTree.core, [file]: 'import o from "other-lib";\nexport const y = o;\n' } };
    assertOneProblem(review(tree, [entry("good-lib", "1.0.0")]), `src/core/${file}`, '"other-lib"', "not on eslint-rules/core-allowlist.js");
  }
  // A listed package that only a .tsx file imports is in use, not planned.
  const tsxOnly: FixtureTree = { ...cleanTree, core: { "view/badge.tsx": 'import lib from "good-lib";\nexport const y = lib;\n' } };
  const result = reviewCoreDependencies({ root: writeTree(tsxOnly), allowlist: [entry("good-lib", "1.0.0")], forbiddenModules });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.planned, []);
});

test("fixture: a listed package that is not a runtime dependency, or a different version, fails", () => {
  const devOnly: FixtureTree = { ...cleanTree, dependencies: { "other-lib": "2.0.0" } };
  const problems = review(devOnly, [entry("good-lib", "1.0.0")]);
  assert.ok(problems.some((problem) => problem.includes('"good-lib", which is not in package.json dependencies')), JSON.stringify(problems));
  assertOneProblem(review(cleanTree, [entry("good-lib", "1.0.1")]).filter((problem) => !problem.startsWith("good-lib: installed")), "good-lib", "1.0.1", "review the new version");
});

test("fixture: a listed package whose code requires child_process with no exception fails and names it", () => {
  const tree: FixtureTree = {
    ...cleanTree,
    packages: { ...cleanTree.packages, "node_modules/good-lib": { version: "1.0.0", dependencies: { helper: "^3.0.0" }, files: { "lib/run.js": 'const cp = require("child_process");\n' } } },
  };
  assertOneProblem(review(tree, [entry("good-lib", "1.0.0")]), "good-lib", "lib/run.js", "child_process", "no exception");
});

test("fixture: a forbidden module in a production dependency of a listed package fails and names that package", () => {
  const tree: FixtureTree = {
    ...cleanTree,
    packages: { ...cleanTree.packages, "node_modules/helper": { version: "3.1.0", files: { "dist/net.mjs": 'import { connect } from "node:net";\nexport default connect;\n' } } },
  };
  assertOneProblem(review(tree, [entry("good-lib", "1.0.0")]), "helper (via good-lib)", "dist/net.mjs", "net");
});

test("fixture: a documented exception accepts exactly its finding, and a stale exception fails", () => {
  const tree: FixtureTree = {
    ...cleanTree,
    packages: { ...cleanTree.packages, "node_modules/good-lib": { version: "1.0.0", dependencies: { helper: "^3.0.0" }, files: { "lib/run.js": 'const cp = require("child_process");\n' } } },
  };
  const exception = { package: "good-lib", file: "lib/run.js", modules: ["child_process"], reason: "fixture" };
  assert.deepEqual(review(tree, [entry("good-lib", "1.0.0", { exceptions: [exception] })]), []);
  assertOneProblem(review(cleanTree, [entry("good-lib", "1.0.0", { exceptions: [exception] })]), "good-lib", "lib/run.js", "no longer matches");
  assertOneProblem(review(tree, [entry("good-lib", "1.0.0", { exceptions: [{ ...exception, modules: ["net"] }] })]).filter((problem) => !problem.includes("no longer matches")), "child_process", "no exception");
});

test("fixture: an entry with no reason, no task, a bad task or an incomplete exception fails and names it", () => {
  const cases: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
    [entry("good-lib", "1.0.0", { reason: "" }), "good-lib has no reason"],
    [entry("good-lib", "1.0.0", { task: undefined }), "good-lib has no task"],
    [entry("good-lib", "1.0.0", { task: "later" }), 'good-lib task "later"'],
    [entry("good-lib", "1.0.0", { licence: " " }), "good-lib has no licence"],
    [entry("good-lib", "^1.0.0"), "is not an exact version"],
    [entry("good-lib", "1.0.0", { exceptions: [{ package: "good-lib", file: "x.js", modules: ["vm"] }] }), "exception without package, file, modules or reason"],
  ];
  for (const [bad, expected] of cases) {
    const problems = review(cleanTree, [bad]);
    assert.ok(problems.some((problem) => problem.includes(expected)), `${expected}: ${JSON.stringify(problems)}`);
  }
});

test("fixture: an install script in the tree of a listed package fails, from package.json or the lockfile", () => {
  const scripted: FixtureTree = { ...cleanTree, packages: { ...cleanTree.packages, "node_modules/helper": { version: "3.1.0", scripts: { postinstall: "node setup.js" } } } };
  assertOneProblem(review(scripted, [entry("good-lib", "1.0.0")]), "helper (via good-lib)", "postinstall");
  const flagged: FixtureTree = { ...cleanTree, packages: { ...cleanTree.packages, "node_modules/good-lib": { version: "1.0.0", dependencies: { helper: "^3.0.0" }, hasInstallScript: true } } };
  assertOneProblem(review(flagged, [entry("good-lib", "1.0.0")]), "good-lib", "install script");
});

test("fixture: a missing install fails, an optional platform package that is not installed is skipped", () => {
  const missing: FixtureTree = { ...cleanTree, packages: { ...cleanTree.packages, "node_modules/helper": { version: "3.1.0", installed: false } } };
  assertOneProblem(review(missing, [entry("good-lib", "1.0.0")]), "helper", "not installed");
  const optional: FixtureTree = { ...cleanTree, packages: { ...cleanTree.packages, "node_modules/helper": { version: "3.1.0", installed: false, optional: true } } };
  assert.deepEqual(review(optional, [entry("good-lib", "1.0.0")]), []);
});

test("residual (pinned): the static scan does not see a module name computed at run time", () => {
  // The throwing stubs catch this form when a core module runs it (core-stubs.test.ts); if the scan learns to
  // see it, change this test to expect a finding.
  assert.deepEqual(scanText('const cp = require("child_" + "process");\n', forbiddenModules), []);
  const tree: FixtureTree = {
    ...cleanTree,
    packages: { ...cleanTree.packages, "node_modules/good-lib": { version: "1.0.0", dependencies: { helper: "^3.0.0" }, files: { "index.js": 'const cp = require("child_" + "process");\n' } } },
  };
  assert.deepEqual(review(tree, [entry("good-lib", "1.0.0")]), []);
});

test("residual 13 (pinned, SR-3): the scan sees only literal module names, not aliases or other capabilities", () => {
  // The scan reads `require("x")`, `import("x")`, `from "x"`, process.binding and getBuiltinModule. These forms
  // pass it today; the throwing stubs catch each of them when the code runs under the guard. Widening the scan
  // (with the exceptions mechanism) is a follow-up; when it lands, turn these into expected findings.
  for (const source of [
    'const r = require;\nr("child_process");\n',
    'require("node:module").createRequire(__filename)("child_" + "process");\n',
    'eval("1");\n',
    'new Function("return 1")();\n',
    'fetch("https://example.invalid");\n',
    'new Worker("./x.js");\n',
    "const home = process.env.HOME;\n",
  ]) {
    assert.deepEqual(scanText(source, forbiddenModules).filter((module) => module !== "module"), [], source);
  }
});
