// Review of the third-party packages that src/core may import (issue #59, architecture section 9 B5, ADR-0005).
// Offline and static: it reads package.json, package-lock.json, the installed files under node_modules and the
// sources of src/core, and never runs package code. Each problem names the package, entry or file.
//
// Checks:
// (a) every bare specifier imported by src/core is on eslint-rules/core-allowlist.js and in `dependencies`; every
//     entry is complete (reason, task, licence, review, exact version equal to package.json and to the install);
//     an entry that no core file imports yet is planned by its task;
// (b) every listed package and its production dependencies (from the lockfile) are scanned for a reference to a
//     forbidden module; a finding must be matched by a documented exception (package, file, module), and an
//     exception that no longer matches is reported as stale;
// (c) no package of that tree has an install script (preinstall, install, postinstall) or `hasInstallScript`.
// Limits (documented residual risks): a module name computed at run time ("child_" + "process") and native
// binaries are not visible to the scan; the throwing stubs catch the former when a core module runs.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

import { isRecord } from "../helpers.js";
import { discoverSources } from "./core-files.js";

export interface DependencyReview {
  /** Every problem, one line each; empty when the review passes. */
  readonly problems: readonly string[];
  /** Listed packages that no core file imports yet, with the task that plans them. */
  readonly planned: readonly string[];
  /** Number of installed packages scanned and number of files read. */
  readonly scannedPackages: number;
  readonly scannedFiles: number;
}

export interface ReviewInput {
  /** Directory with package.json, package-lock.json, node_modules and src/core. */
  readonly root: string;
  /** The `corePackages` export of eslint-rules/core-allowlist.js. */
  readonly allowlist: unknown;
  /** Module names the scan looks for (FORBIDDEN_MODULES of eslint.config.core.js). */
  readonly forbiddenModules: readonly string[];
}

interface ScanException {
  readonly package: string;
  readonly file: string;
  readonly modules: readonly string[];
}

interface Entry {
  readonly name: string;
  readonly version: string;
  readonly task: string;
  readonly exceptions: readonly ScanException[];
}

const SCANNED = /\.(?:[mc]?js)$/;
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

function readJson(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${file} is not a JSON object`);
  }
  return parsed;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);
const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/** Validate the data file; every incomplete entry is a problem that names it. */
function parseAllowlist(allowlist: unknown, problems: string[]): Entry[] {
  if (!Array.isArray(allowlist)) {
    problems.push("core-allowlist.js: corePackages is not an array");
    return [];
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();
  allowlist.forEach((raw: unknown, index) => {
    const value = record(raw);
    const name = text(value["name"]) ?? `entry ${index + 1}`;
    const missing = ["name", "version", "task", "reason", "licence", "reviewed", "review"].filter((field) => text(value[field]) === undefined);
    for (const field of missing) {
      problems.push(`core-allowlist.js: ${name} has no ${field}`);
    }
    const version = text(value["version"]) ?? "";
    const task = text(value["task"]) ?? "";
    if (version !== "" && !/^\d+\.\d+\.\d+$/.test(version)) {
      problems.push(`core-allowlist.js: ${name} version "${version}" is not an exact version`);
    }
    if (task !== "" && !/^#\d+$/.test(task)) {
      problems.push(`core-allowlist.js: ${name} task "${task}" is not an issue reference such as #17`);
    }
    const reviewed = text(value["reviewed"]);
    if (reviewed !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(reviewed)) {
      problems.push(`core-allowlist.js: ${name} reviewed "${reviewed}" is not a date (YYYY-MM-DD)`);
    }
    if (seen.has(name)) {
      problems.push(`core-allowlist.js: ${name} is listed twice`);
    }
    seen.add(name);
    const exceptions: ScanException[] = [];
    const rawExceptions: unknown = value["exceptions"];
    if (!Array.isArray(rawExceptions)) {
      problems.push(`core-allowlist.js: ${name} has no exceptions array`);
    } else {
      for (const item of rawExceptions) {
        const exception = record(item);
        const modules: unknown = exception["modules"];
        const pkg = text(exception["package"]);
        const file = text(exception["file"]);
        const moduleList = Array.isArray(modules) ? modules.filter((module): module is string => typeof module === "string") : [];
        if (pkg === undefined || file === undefined || moduleList.length === 0 || text(exception["reason"]) === undefined) {
          problems.push(`core-allowlist.js: ${name} has an exception without package, file, modules or reason`);
          continue;
        }
        exceptions.push({ package: pkg, file, modules: moduleList });
      }
    }
    if (missing.length === 0) {
      entries.push({ name, version, task, exceptions });
    }
  });
  return entries;
}

/** Package name of a bare specifier, or undefined for relative, node: and URL specifiers. */
function packageName(specifier: string): string | undefined {
  if (/^\.{1,2}(?:\/|$)/.test(specifier) || specifier.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)) {
    return undefined;
  }
  const parts = specifier.split("/");
  return parts.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

function walk(directory: string, accept: (name: string) => boolean, skipDirectory: (name: string) => boolean): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirectory(entry.name)) {
        files.push(...walk(path, accept, skipDirectory));
      }
    } else if (entry.isFile() && accept(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** Bare package imports of src/core: package name to the core files that import it. */
function coreImports(root: string): Map<string, string[]> {
  const imports = new Map<string, string[]>();
  const core = join(root, "src", "core");
  for (const file of existsSync(core) ? discoverSources(core) : []) {
    const info = ts.preProcessFile(readFileSync(file, "utf8"), true, true);
    for (const imported of info.importedFiles) {
      const name = packageName(imported.fileName);
      if (name !== undefined) {
        const where = relative(root, file).split(sep).join("/");
        imports.set(name, [...(imports.get(name) ?? []), where]);
      }
    }
  }
  return imports;
}

/** Node.js resolution over lockfile keys: node_modules/a/node_modules/b, then up to node_modules/b. */
function resolveLockKey(packages: Record<string, unknown>, from: string, name: string): string | undefined {
  let base = from;
  for (;;) {
    const key = `${base === "" ? "" : `${base}/`}node_modules/${name}`;
    if (key in packages) {
      return key;
    }
    if (base === "") {
      return undefined;
    }
    const cut = base.lastIndexOf("/node_modules/");
    base = cut < 0 ? "" : base.slice(0, cut);
  }
}

/** Forbidden-module references in one file's text (comments included: the scan errs on the safe side). */
export function scanText(source: string, forbiddenModules: readonly string[]): string[] {
  if (!forbiddenModules.every((name) => /^[a-z_0-9]+$/.test(name))) {
    throw new Error("forbidden module names must be plain identifiers");
  }
  const names = forbiddenModules.join("|");
  const specifier = String.raw`(['"${"`"}])(?:node:)?(${names})(?:/[^'"${"`"}]*)?\1`;
  const patterns = [
    new RegExp(String.raw`\b(?:require|import)\s*\(\s*${specifier}`, "g"), // require("x"), import("x")
    new RegExp(String.raw`\b(?:from|import)\s*${specifier}`, "g"), // import ... from "x", export ... from "x", import "x"
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[2] !== undefined) {
        found.add(match[2]);
      }
    }
  }
  if (/\bprocess\s*\.\s*binding\s*\(/.test(source)) {
    found.add("process.binding");
  }
  if (/\bgetBuiltinModule\s*\(/.test(source)) {
    found.add("process.getBuiltinModule");
  }
  return [...found].sort();
}

/** Run the whole review. */
export function reviewCoreDependencies(input: ReviewInput): DependencyReview {
  const problems: string[] = [];
  const planned: string[] = [];
  const entries = parseAllowlist(input.allowlist, problems);
  const manifest = readJson(join(input.root, "package.json"));
  const dependencies = record(manifest["dependencies"]);
  const lockPackages = record(readJson(join(input.root, "package-lock.json"))["packages"]);
  const listed = new Map(entries.map((entry) => [entry.name, entry]));

  // (a) Imports of the core against the list and package.json.
  const imports = coreImports(input.root);
  for (const [name, files] of imports) {
    if (!listed.has(name)) {
      problems.push(`${files.join(", ")} imports "${name}", which is not on eslint-rules/core-allowlist.js`);
    }
    if (!(name in dependencies)) {
      problems.push(`${files.join(", ")} imports "${name}", which is not in package.json dependencies`);
    }
  }
  for (const entry of entries) {
    if (dependencies[entry.name] !== entry.version) {
      problems.push(
        `core-allowlist.js: ${entry.name} was reviewed at ${entry.version}, package.json dependencies has ${text(dependencies[entry.name]) ?? "nothing"}: review the new version`,
      );
    }
    if (!imports.has(entry.name)) {
      planned.push(`${entry.name} (${entry.task})`);
    }
  }

  // (b) and (c) over each listed package and its production dependencies.
  let scannedPackages = 0;
  let scannedFiles = 0;
  for (const entry of entries) {
    const rootKey = resolveLockKey(lockPackages, "", entry.name);
    if (rootKey === undefined) {
      problems.push(`${entry.name}: not in package-lock.json`);
      continue;
    }
    const used = new Set<ScanException>();
    const queue = [rootKey];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const key = queue.shift() ?? "";
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const lock = record(lockPackages[key]);
      const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      for (const dependency of Object.keys({ ...record(lock["dependencies"]), ...record(lock["optionalDependencies"]) })) {
        const resolved = resolveLockKey(lockPackages, key, dependency);
        if (resolved === undefined) {
          if (!(dependency in record(lock["optionalDependencies"]))) {
            problems.push(`${name}: dependency ${dependency} is not in package-lock.json`);
          }
        } else {
          queue.push(resolved);
        }
      }
      if (lock["hasInstallScript"] === true) {
        problems.push(`${name} (via ${entry.name}): package-lock.json marks an install script`);
      }
      const directory = join(input.root, ...key.split("/"));
      if (!existsSync(join(directory, "package.json"))) {
        if (lock["optional"] !== true) {
          problems.push(`${name} (via ${entry.name}): not installed; run npm ci --ignore-scripts`);
        }
        continue;
      }
      scannedPackages += 1;
      const installed = readJson(join(directory, "package.json"));
      const scripts = record(installed["scripts"]);
      for (const script of INSTALL_SCRIPTS) {
        if (text(scripts[script]) !== undefined) {
          problems.push(`${name} (via ${entry.name}): declares a ${script} script`);
        }
      }
      if (key === rootKey && installed["version"] !== entry.version) {
        problems.push(`${entry.name}: installed ${String(installed["version"])}, reviewed ${entry.version}: review the installed version`);
      }
      for (const file of walk(directory, (fileName) => SCANNED.test(fileName), (directoryName) => directoryName === "node_modules")) {
        scannedFiles += 1;
        const where = relative(directory, file).split(sep).join("/");
        for (const module of scanText(readFileSync(file, "utf8"), input.forbiddenModules)) {
          const exception = entry.exceptions.find((candidate) => candidate.package === name && candidate.file === where && candidate.modules.includes(module));
          if (exception === undefined) {
            problems.push(`${name} (via ${entry.name}): ${where} references ${module} and core-allowlist.js documents no exception`);
          } else {
            used.add(exception);
          }
        }
      }
    }
    for (const exception of entry.exceptions) {
      const exceptionKey = [...seen].find((key) => key.endsWith(`node_modules/${exception.package}`));
      const installed = exceptionKey !== undefined && existsSync(join(input.root, ...exceptionKey.split("/"), "package.json"));
      if (installed && !used.has(exception)) {
        problems.push(`core-allowlist.js: the exception for ${exception.package} ${exception.file} no longer matches a finding; remove it`);
      }
      if (exceptionKey === undefined) {
        problems.push(`core-allowlist.js: the exception for ${exception.package} names a package outside the tree of ${entry.name}`);
      }
    }
  }
  return { problems, planned, scannedPackages, scannedFiles };
}
