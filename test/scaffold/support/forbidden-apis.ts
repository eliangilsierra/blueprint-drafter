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
// Scope and limits (documented residual risks of #59):
// - Install the stubs before the code under test is first imported: a reference captured earlier is the original.
// - The stubs cover this thread only. Code inside a worker thread (#21) runs without them.
// - process.dlopen stays in place: native add-ons (@resvg/resvg-js) load through it, and native code is not
//   observable from JavaScript.
// Reused by the end-to-end isolation suite of #46.

import { constants } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const thisFile = fileURLToPath(import.meta.url);

/** Modules whose every exported function or class is replaced: they start processes, open sockets or evaluate code. */
export const STUBBED_MODULES = ["child_process", "cluster", "dgram", "dns", "http", "http2", "https", "net", "tls", "vm"] as const;

/** File-system functions that change the file system (also with the Sync suffix in node:fs). */
const FS_WRITE_FUNCTIONS = [
  "appendFile",
  "chmod",
  "chown",
  "copyFile",
  "cp",
  "fchmod",
  "fchown",
  "ftruncate",
  "futimes",
  "lchmod",
  "lchown",
  "link",
  "lutimes",
  "mkdir",
  "mkdtemp",
  "rename",
  "rm",
  "rmdir",
  "symlink",
  "truncate",
  "unlink",
  "utimes",
  "write",
  "writeFile",
  "writev",
] as const;

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
  /** Restore every original; safe to call twice. */
  uninstall(): void;
}

type Callable = (...args: unknown[]) => unknown;

interface Replacement {
  readonly target: object;
  readonly key: PropertyKey;
  readonly original: PropertyDescriptor;
}

let active: InstalledStubs | undefined;

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
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: original.enumerable ?? false,
      writable: true,
      value: stubOf(api, value, allow),
    });
    replacements.push({ target, key, original });
    stubbed.push(api);
  }

  for (const name of STUBBED_MODULES) {
    const exports = asRecord(require(`node:${name}`));
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
    const fs = asRecord(require("node:fs"));
    const fsPromises = asRecord(require("node:fs/promises"));
    for (const name of FS_WRITE_FUNCTIONS) {
      replace(fs, name, `fs.${name}`);
      replace(fs, `${name}Sync`, `fs.${name}Sync`);
      replace(fsPromises, name, `fs/promises.${name}`);
    }
    replace(fs, "createWriteStream", "fs.createWriteStream");
    replace(fs, "WriteStream", "fs.WriteStream");
    const readOnly = (args: unknown[]): boolean => isReadOnlyOpen(args[1]);
    replace(fs, "open", "fs.open (write flags)", readOnly);
    replace(fs, "openSync", "fs.openSync (write flags)", readOnly);
    replace(fsPromises, "open", "fs/promises.open (write flags)", readOnly);
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

  let installed = true;
  const stubs: InstalledStubs = {
    calls,
    stubbed,
    uninstall() {
      if (!installed) {
        return;
      }
      installed = false;
      for (const { target, key, original } of replacements.reverse()) {
        Object.defineProperty(target, key, original);
      }
      syncBuiltinESMExports();
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
