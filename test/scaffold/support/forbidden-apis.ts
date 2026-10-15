// Throwing stubs for the APIs that the core must never use (architecture section 7.9, NFR-8, AC-44; issue #59).
//
// installForbiddenApiStubs() replaces, in this process, the exports of the process and network modules, the
// creation of worker threads, the write functions of node:fs and node:fs/promises, the network globals and the
// code-evaluation entry points with stubs that record the attempt and throw ForbiddenApiError. Each stub is a
// Proxy of the original, so reading a static member or using `instanceof` at import time still works; only a call
// or a construction is stopped. ES module bindings of the built-ins are updated with syncBuiltinESMExports(), so
// `import { spawn } from "node:child_process"` sees the stub too. The report lists every attempt, also those that
// the calling code caught and swallowed.
//
// What is stubbed is derived, not listed by hand: every module of FORBIDDEN_MODULES (the lint deny-list of
// eslint.config.core.js) except the reasoned RUNTIME_EXCEPTIONS, and every function of node:fs and
// node:fs/promises except the read-only allow-lists below. Tests check both derivations.
//
// Scope and limits (documented residual risks of #59):
// - A stubbed class is reachable unstubbed through its prototype (`net.Socket.prototype.constructor`) and through
//   an instance created before the install (the standard streams). Residual risk 11, pinned in core-stubs.test.ts.
// - Install the stubs before the code under test is first imported: a reference captured earlier is the original.
// - The stubs cover this thread only. Code inside a worker thread (#21) runs without them.
// - process.dlopen stays in place: native add-ons (@resvg/resvg-js) load through it, and native code is not
//   observable from JavaScript.
// - Only calls made while the stubs are installed are seen. Work that a module schedules at import and that runs
//   later (a timer, setImmediate, an I/O or event callback) escapes runUnderStubs(); promise reactions queued during
//   the import still run inside it. Pinned by "residual O-1" in core-stubs.test.ts.
// - Only forbidden calls are checked. Other import-time side effects (a change to a prototype or a new global) are
//   not detected. Pinned by "residual O-2" in core-stubs.test.ts; AGENTS.md asks that core modules have none.
// Reused by the end-to-end isolation suite of #46.

import { constants } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { repositoryRoot } from "../helpers.js";

const require = createRequire(import.meta.url);
const thisFile = fileURLToPath(import.meta.url);

// The runtime layer is derived from the lint deny-list, so the two cannot drift (SR-2 of PR #61).
const coreConfig: unknown = await import(pathToFileURL(join(repositoryRoot, "eslint.config.core.js")).href);
const forbidden: unknown =
  typeof coreConfig === "object" && coreConfig !== null ? Reflect.get(coreConfig, "FORBIDDEN_MODULES") : undefined;
if (!Array.isArray(forbidden) || !forbidden.every((name): name is string => typeof name === "string")) {
  throw new Error("eslint.config.core.js does not export FORBIDDEN_MODULES");
}

/** The modules that the core must never load: FORBIDDEN_MODULES of eslint.config.core.js. */
export const FORBIDDEN_MODULES: readonly string[] = forbidden;

/**
 * Forbidden modules that are not stubbed export by export, each with the reason. Every other forbidden module has
 * every exported function and class replaced; core-stubs.test.ts checks that the two lists cover the deny-list.
 */
export const RUNTIME_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "module",
    "lint and scan only: its exports are the Module class that Node.js itself uses to load every CommonJS file, so stubbing them would break loading; what createRequire() loads is a module whose exports are stubbed",
  ],
  [
    "worker_threads",
    "only the Worker constructor is stubbed (workerCallers lets the files granted by #21 through); parentPort and workerData are what the worker entry is granted to use",
  ],
]);

/** Modules whose every exported function or class is replaced: the deny-list minus RUNTIME_EXCEPTIONS. */
export const STUBBED_MODULES: readonly string[] = FORBIDDEN_MODULES.filter((name) => !RUNTIME_EXCEPTIONS.has(name));

/**
 * Functions of node:fs that only read; every other function or class of node:fs is a write and is stubbed, so a
 * write API added by a later Node.js release (Utf8Stream, mkdtempDisposableSync in Node.js 24) is covered without
 * an edit. open, openSync and fs/promises open are let through only with read-only flags.
 */
export const READ_ONLY_FS: ReadonlySet<string> = new Set([
  "Dir",
  "Dirent",
  "FileReadStream",
  "ReadStream",
  "Stats",
  "access",
  "accessSync",
  "close",
  "closeSync",
  "createReadStream",
  "exists",
  "existsSync",
  "fstat",
  "fstatSync",
  "glob",
  "globSync",
  "lstat",
  "lstatSync",
  "openAsBlob",
  "opendir",
  "opendirSync",
  "read",
  "readFile",
  "readFileSync",
  "readSync",
  "readdir",
  "readdirSync",
  "readlink",
  "readlinkSync",
  "readv",
  "readvSync",
  "realpath",
  "realpathSync",
  "stat",
  "statSync",
  "statfs",
  "statfsSync",
  "unwatchFile",
  "watch",
  "watchFile",
]);

/** The same for node:fs/promises. */
export const READ_ONLY_FS_PROMISES: ReadonlySet<string> = new Set([
  "access",
  "glob",
  "lstat",
  "opendir",
  "readFile",
  "readdir",
  "readlink",
  "realpath",
  "stat",
  "statfs",
  "watch",
]);

const OPEN_FUNCTIONS = new Set(["open", "openSync"]);

const NETWORK_GLOBALS = ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"] as const;

/** One attempted call of a forbidden API. */
export interface ForbiddenCall {
  /** For example "child_process.spawn", "fs.writeFileSync", "globalThis.fetch", "Function". */
  readonly api: string;
  /** File of the first stack frame outside this module, when V8 reports one. */
  readonly caller: string | undefined;
}

/** Thrown by every stub. */
export class ForbiddenApiError extends Error {
  readonly api: string;

  constructor(api: string) {
    super(`forbidden API used while the isolation stubs are installed: ${api}`);
    this.name = "ForbiddenApiError";
    this.api = api;
  }
}

export interface StubOptions {
  /** Leave the file-system write functions in place (tests of src/core/io, #34, which write to a temporary directory). */
  readonly allowWrites?: boolean;
  /** Absolute paths of the files that may construct a worker_threads Worker (the grant of #21). */
  readonly workerCallers?: readonly string[];
}

export interface InstalledStubs {
  /** Attempts recorded so far, in order. */
  readonly calls: readonly ForbiddenCall[];
  /** Every API that was replaced, for example "net.connect". */
  readonly stubbed: readonly string[];
  /** The stub installed for each API, so a test can call every one of them. */
  readonly stubs: ReadonlyMap<string, Callable>;
  /** Restore every original; safe to call twice. */
  uninstall(): void;
}

export type Callable = (...args: unknown[]) => unknown;

interface Replacement {
  readonly target: object;
  readonly key: PropertyKey;
  readonly original: PropertyDescriptor;
}

let active: InstalledStubs | undefined;

/**
 * Load a built-in module. node:wasi announces itself with an ExperimentalWarning on first load; the stubs load it
 * only to replace its exports, so that one warning is kept out of the test output.
 */
function loadBuiltin(name: string): unknown {
  if (name !== "wasi") {
    return require(`node:${name}`);
  }
  const emitWarning: unknown = Reflect.get(process, "emitWarning");
  Reflect.set(process, "emitWarning", () => undefined);
  try {
      return require("node:wasi");
    } finally {
      Reflect.set(process, "emitWarning", emitWarning);
    }
  }

  function isCallable(value: unknown): value is Callable {
    return typeof value === "function";
  }

  function asRecord(value: unknown): Record<PropertyKey, unknown> {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
      throw new TypeError("expected an object");
    }
    // A module namespace or exports object: its keys are read and replaced one by one.
    return value as Record<PropertyKey, unknown>;
  }

  /** The file of the first stack frame outside this module and outside Node.js itself. */
  function callerFile(): string | undefined {
    const originalPrepare: unknown = Reflect.get(Error, "prepareStackTrace");
    const originalLimit = Error.stackTraceLimit;
    try {
      Error.stackTraceLimit = 30;
      Error.prepareStackTrace = (_error, frames) => frames;
      const holder: { stack?: unknown } = {};
      Error.captureStackTrace(holder);
      const frames = Array.isArray(holder.stack) ? (holder.stack as NodeJS.CallSite[]) : [];
      for (const frame of frames) {
        const name = frame.getFileName() ?? undefined;
        if (name === undefined || name.startsWith("node:")) {
          continue;
        }
        const file = name.startsWith("file:") ? fileURLToPath(name) : name;
        if (file !== thisFile) {
          return file;
        }
      }
      return undefined;
    } finally {
      Reflect.set(Error, "prepareStackTrace", originalPrepare);
      Error.stackTraceLimit = originalLimit;
    }
  }

  const WRITE_FLAGS = constants.O_WRONLY | constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_TRUNC;

  /** True when the flags argument of an open function only reads. */
  function isReadOnlyOpen(flags: unknown): boolean {
    if (flags === undefined || flags === null || typeof flags === "function") {
      return true;
    }
    if (typeof flags === "number") {
      return (flags & WRITE_FLAGS) === 0;
    }
    return flags === "r" || flags === "rs" || flags === "sr";
  }

  /** Install the throwing stubs in this process. Only one installation can be active at a time. */
  export function installForbiddenApiStubs(options: StubOptions = {}): InstalledStubs {
    if (active !== undefined) {
      throw new Error("the forbidden-API stubs are already installed");
    }
    // Create the standard streams now: a stream created later would go through the stubbed net module.
    const standardStreams: readonly unknown[] = [process.stdout, process.stderr];
    if (standardStreams.includes(undefined)) {
      throw new Error("the standard streams are not available");
    }

    const calls: ForbiddenCall[] = [];
    const stubbed: string[] = [];
    const stubFunctions = new Map<string, Callable>();
    const replacements: Replacement[] = [];
    const workerCallers = new Set(options.workerCallers ?? []);

    /** Record the attempt and throw; `allow` lets a call through (read-only open, an allowed worker caller). */
    function stubOf(api: string, original: Callable, allow?: (args: unknown[], caller: string | undefined) => boolean): Callable {
      const deny = (args: unknown[]): void => {
        const caller = callerFile();
        if (allow?.(args, caller) === true) {
          return;
        }
        calls.push({ api, caller });
        throw new ForbiddenApiError(api);
      };
      return new Proxy(original, {
        apply(target, thisArgument, args: unknown[]) {
          deny(args);
          return Reflect.apply(target, thisArgument, args);
        },
        construct(target, args: unknown[], newTarget) {
          deny(args);
          return Reflect.construct(target, args, newTarget) as object;
        },
      });
    }

    function replace(target: object, key: PropertyKey, api: string, allow?: (args: unknown[], caller: string | undefined) => boolean): void {
      const original = Object.getOwnPropertyDescriptor(target, key);
      if (original === undefined) {
        return;
      }
      const value: unknown = "value" in original ? original.value : original.get?.call(target);
      if (!isCallable(value)) {
        return;
      }
      const stub = stubOf(api, value, allow);
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: original.enumerable ?? false,
        writable: true,
        value: stub,
      });
      replacements.push({ target, key, original });
      stubbed.push(api);
      stubFunctions.set(api, stub);
    }

    function restore(): void {
      for (const { target, key, original } of replacements.reverse()) {
        Object.defineProperty(target, key, original);
      }
      replacements.length = 0;
      syncBuiltinESMExports();
    }

    // A failure part-way (an export that cannot be replaced, a module missing on some Node.js version) restores
    // what was already replaced before it is rethrown, so no stub stays behind without an uninstall handle.
    try {
    for (const name of STUBBED_MODULES) {
      const exports = asRecord(loadBuiltin(name));
      for (const key of Object.keys(exports)) {
        replace(exports, key, `${name}.${key}`);
      }
    }
    const dnsPromises = asRecord(require("node:dns/promises"));
    for (const key of Object.keys(dnsPromises)) {
      replace(dnsPromises, key, `dns/promises.${key}`);
    }

    replace(asRecord(require("node:worker_threads")), "Worker", "worker_threads.Worker", (_args, caller) => caller !== undefined && workerCallers.has(caller));

    if (options.allowWrites !== true) {
      const readOnly = (args: unknown[]): boolean => isReadOnlyOpen(args[1]);
      const fs = asRecord(require("node:fs"));
      for (const key of Object.keys(fs)) {
        if (OPEN_FUNCTIONS.has(key)) {
          replace(fs, key, `fs.${key} (write flags)`, readOnly);
        } else if (!READ_ONLY_FS.has(key)) {
          replace(fs, key, `fs.${key}`);
        }
      }
      const fsPromises = asRecord(require("node:fs/promises"));
      for (const key of Object.keys(fsPromises)) {
        if (key === "open") {
          replace(fsPromises, key, "fs/promises.open (write flags)", readOnly);
        } else if (!READ_ONLY_FS_PROMISES.has(key)) {
          replace(fsPromises, key, `fs/promises.${key}`);
        }
      }
    }

    for (const name of NETWORK_GLOBALS) {
      replace(globalThis, name, `globalThis.${name}`);
    }

    // Code evaluation: eval, and the four function constructors, also when reached through a prototype
    // (`(() => {}).constructor`). The same Proxy serves globalThis.Function and Function.prototype.constructor, so
    // `f.constructor === Function` and `instanceof Function` keep working.
    replace(globalThis, "eval", "eval");
    const constructors: ReadonlyArray<readonly [string, object]> = [
      ["Function", Function.prototype],
      ["AsyncFunction", Object.getPrototypeOf(async () => {
        await Promise.resolve();
      }) as object],
      ["GeneratorFunction", Object.getPrototypeOf(function* generator() {
        // An empty generator: only its prototype is used.
      }) as object],
      ["AsyncGeneratorFunction", Object.getPrototypeOf(async function* generator() {
        // An empty async generator: only its prototype is used.
      }) as object],
    ];
    for (const [api, prototype] of constructors) {
      replace(prototype, "constructor", api);
    }
    const functionStub = Object.getOwnPropertyDescriptor(Function.prototype, "constructor")?.value as unknown;
    const functionOriginal = Object.getOwnPropertyDescriptor(globalThis, "Function");
    if (functionOriginal !== undefined && isCallable(functionStub)) {
      Object.defineProperty(globalThis, "Function", { ...functionOriginal, value: functionStub });
      replacements.push({ target: globalThis, key: "Function", original: functionOriginal });
    }

    replace(process, "binding", "process.binding");
    replace(process, "kill", "process.kill");

    syncBuiltinESMExports();
  } catch (error: unknown) {
    restore();
    throw error;
  }

  let installed = true;
  const stubs: InstalledStubs = {
    calls,
    stubbed,
    stubs: stubFunctions,
    uninstall() {
      if (!installed) {
        return;
      }
      installed = false;
      restore();
      active = undefined;
    },
  };
  active = stubs;
  return stubs;
}

/** Run an action with the stubs installed; the stubs are removed afterwards, also when the action throws. */
export async function runUnderStubs(
  action: () => unknown,
  options: StubOptions = {},
): Promise<{ readonly calls: readonly ForbiddenCall[]; readonly error: unknown }> {
  const stubs = installForbiddenApiStubs(options);
  try {
    await action();
    return { calls: [...stubs.calls], error: undefined };
  } catch (error: unknown) {
    return { calls: [...stubs.calls], error };
  } finally {
    stubs.uninstall();
  }
}

/** One line per attempt, for assertion messages. */
export function formatCalls(calls: readonly ForbiddenCall[]): string {
  return calls.map((call) => `${call.api} (from ${call.caller ?? "an unknown file"})`).join("; ");
}

/** Fail with the list of attempts when there is any: the guard of AC-44. */
export function assertNoForbiddenCalls(calls: readonly ForbiddenCall[], subject: string): void {
  if (calls.length > 0) {
    throw new Error(`${subject} used forbidden APIs: ${formatCalls(calls)}`);
  }
}
