// Guard (b) of AC-44 (issue #59): run the public API v1 of the core (architecture section 7.1) on the acceptance
// corpus. Call it inside runUnderStubs(); the forbidden calls are checked by the caller. This harness makes sure
// that the run cannot pass without exercising the core (CR-5 of PR #61):
// - an API that exports any function must export `parse`, and `parse` must return a diagram for every corpus case
//   (all cases of bench/cases are valid);
// - an error from a v1 function on a valid case is a problem (architecture section 7.1: exceptions are reserved for
//   programming errors), except ForbiddenApiError, which is rethrown so that the caller sees the attempt.
// An API with no function at all (the scaffold today) has nothing to run: the result says so in `idle`.

import { isRecord } from "../helpers.js";
import { ForbiddenApiError } from "./forbidden-apis.js";

export interface CorpusRun {
  /** v1 functions that were called at least once. */
  readonly exercised: ReadonlySet<string>;
  /** Reasons the run does not count; the guard fails when there is any. */
  readonly problems: readonly string[];
  /** True when the API exports no function yet, so nothing could run. */
  readonly idle: boolean;
}

const field = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);

/** Run every v1 function that the API exports on each corpus case. */
export async function exerciseCorpus(
  api: Readonly<Record<string, unknown>>,
  corpus: ReadonlyArray<readonly [string, string]>,
  operations: readonly string[],
): Promise<CorpusRun> {
  const exercised = new Set<string>();
  const problems: string[] = [];
  const functions = Object.keys(api).filter((name) => typeof api[name] === "function");
  if (functions.length === 0) {
    return { exercised, problems, idle: true };
  }
  if (typeof api["parse"] !== "function") {
    problems.push(`the core exports functions (${functions.sort().join(", ")}) but no parse, so the corpus cannot run; extend support/corpus-guard.ts`);
    return { exercised, problems, idle: false };
  }

  for (const [file, text] of corpus) {
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
        problems.push(`${name} threw on ${file}: ${String(thrown)}`);
        return undefined;
      }
    };
    const diagram = field(await call("parse", text), "diagram");
    if (diagram === undefined) {
      problems.push(`parse returned no diagram for ${file}, a valid corpus case`);
      continue;
    }
    await call("serialize", diagram);
    await call("show", diagram);
    await call("diff", diagram, diagram);
    if (file === "08-before.bpd") {
      await call("applyOps", diagram, operations);
    }
    const checked = await call("check", diagram);
    if (checked !== undefined) {
      await call("formatDiagnostics", checked);
    }
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
  return { exercised, problems, idle: false };
}
