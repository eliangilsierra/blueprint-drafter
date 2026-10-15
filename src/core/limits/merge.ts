/**
 * Merging partial overrides into the limits, with validation (architecture section 7.1, `opts.limits`).
 */

import { createDiagnostic, quoteFragment, sortDiagnostics } from "../model/index.js";
import type { Diagnostic } from "../model/index.js";

import { DEFAULT_LIMITS, LIMIT_TABLE, MAX_REPORTED_DIAGNOSTICS } from "./table.js";
import type { LimitSpec, Limits } from "./table.js";

export interface MergeResult {
  /** The limits to use: the merge when every override is valid, otherwise the defaults, unchanged. */
  limits: Limits;
  /** One `E_BAD_VALUE` per rejected override, sorted. Empty when `limits` holds the overrides. */
  diagnostics: Diagnostic[];
}

const SPECS: ReadonlyMap<string, LimitSpec> = new Map(LIMIT_TABLE.map((spec) => [spec.name, spec]));

/** Describes an untrusted value without calling any method of it: a number, a quoted string or its type. */
function describeValue(value: unknown): string {
  switch (typeof value) {
    case "number":
      return String(value);
    case "string":
      return quoteFragment(value);
    default:
      return `a value of type ${typeof value}`;
  }
}

function reject(name: string, message: string, fix: string): Diagnostic {
  return createDiagnostic("E_BAD_VALUE", [name], message, { fix });
}

/** The reason an override is not acceptable, or `undefined` when it is. */
function problemWith(spec: LimitSpec, value: unknown): Diagnostic | undefined {
  const range = `an integer from ${String(spec.floor)} to ${String(spec.ceiling)} ${spec.unit}`;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return reject(spec.name, `limit ${spec.name} must be ${range}, got ${describeValue(value)}`, `Use ${range}`);
  }
  if (value < spec.floor || value > spec.ceiling) {
    return reject(spec.name, `limit ${spec.name} must be ${range}, got ${String(value)}`, `Use ${range}`);
  }
  return undefined;
}

/**
 * Merges partial overrides into the defaults.
 *
 * Every override must be a safe integer between the floor and the hard ceiling of its row in the table (so a
 * non-integer, `NaN`, an infinity, a negative number, zero, a string and a value above the ceiling are all
 * rejected), and its name must be a limit of the table (a typo would otherwise leave the default silently in
 * force). The merge is all or nothing: when any override is rejected the result carries the defaults and one
 * `E_BAD_VALUE` diagnostic per rejected override, so a caller that ignores the diagnostics never runs with a
 * limit it did not validate. An override whose value is `undefined` counts as not given (a configuration loader
 * may leave a key undefined).
 *
 * Interpretation of #10: the catalogue has no code for a bad configuration value, so `E_BAD_VALUE` (a value
 * outside its allowed set) is used for every rejection, with the allowed range in the message and in the fix.
 */
export function mergeLimits(overrides: Partial<Limits> = {}): MergeResult {
  // The type says Partial<Limits>, but the value comes from configuration or JSON: validate it as unknown.
  const given: unknown = overrides;
  if (typeof given !== "object" || given === null) {
    return {
      limits: DEFAULT_LIMITS,
      diagnostics: [createDiagnostic("E_BAD_VALUE", [], `limit overrides must be an object, got ${describeValue(given)}`, { fix: "Pass an object of limit names and integers" })],
    };
  }
  const found: Diagnostic[] = [];
  const accepted = new Map<string, number>();
  for (const key of Object.keys(given)) {
    if (found.length >= MAX_REPORTED_DIAGNOSTICS) {
      break;
    }
    const value: unknown = Reflect.get(given, key);
    if (value === undefined) {
      continue;
    }
    const spec = SPECS.get(key);
    if (spec === undefined) {
      found.push(reject(key, `${quoteFragment(key)} is not a limit`, `Use one of: ${LIMIT_TABLE.map((row) => row.name).join(", ")}`));
      continue;
    }
    const problem = problemWith(spec, value);
    if (problem === undefined) {
      // problemWith proved the value is a number.
      accepted.set(key, value as number);
    } else {
      found.push(problem);
    }
  }
  if (found.length > 0) {
    return { limits: DEFAULT_LIMITS, diagnostics: sortDiagnostics(found) };
  }
  const merged: Record<string, number> = {};
  for (const spec of LIMIT_TABLE) {
    merged[spec.name] = accepted.get(spec.name) ?? spec.default;
  }
  // The cast is sound: the loop sets exactly the names of LIMIT_TABLE, which Limits is derived from.
  return { limits: Object.freeze(merged) as Limits, diagnostics: [] };
}
