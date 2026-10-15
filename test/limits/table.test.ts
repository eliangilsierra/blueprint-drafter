import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_LIMITS, LIMIT_TABLE, MAX_PNG_SCALE, MAX_REPORTED_DIAGNOSTICS } from "../../src/core/limits/index.js";
import type { LimitName, Limits } from "../../src/core/limits/index.js";
import type { LayoutLimits } from "../../src/core/model/index.js";
import { readText } from "../scaffold/helpers.js";

/** Compile-time check: the call only compiles when `T` is `true`. */
function assertType<T extends true>(value?: T): T | undefined {
  return value;
}
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const NAMES = [
  "maxFileBytes",
  "maxLineChars",
  "maxElements",
  "maxLabelChars",
  "maxIdChars",
  "maxGroupDepth",
  "maxOpsPerBatch",
  "maxOpsBytes",
  "maxFiles",
  "maxPngPixels",
  "layoutTimeoutMs",
  "layoutWorkerHeapMb",
] as const;

describe("DEFAULT_LIMITS (architecture section 9)", () => {
  it("holds the provisional values of the architecture", () => {
    assert.deepEqual({ ...DEFAULT_LIMITS }, {
      maxFileBytes: 1_048_576,
      maxLineChars: 4096,
      maxElements: 1000,
      maxLabelChars: 500,
      maxIdChars: 64,
      maxGroupDepth: 16,
      maxOpsPerBatch: 1000,
      maxOpsBytes: 1_048_576,
      maxFiles: 10_000,
      maxPngPixels: 40_000_000,
      layoutTimeoutMs: 10_000,
      layoutWorkerHeapMb: 512,
    });
    assert.equal(MAX_PNG_SCALE, 4);
  });

  it("has exactly the limits of the table of section 9, in its order", () => {
    const section = readText("docs", "architecture", "3-mvp-architecture.md").split("\n## 9. Security")[1] ?? "";
    const table = section.split("\n## 10.")[0] ?? "";
    const documented = [...table.matchAll(/^\s*\| `(\w+)`/gm)].map((match) => match[1]);
    assert.deepEqual(documented, [...NAMES]);
    assert.deepEqual(LIMIT_TABLE.map((spec) => spec.name), [...NAMES]);
    assert.deepEqual(Object.keys(DEFAULT_LIMITS), [...NAMES]);
  });

  it("is frozen, so no caller can change a default", () => {
    assert.ok(Object.isFrozen(DEFAULT_LIMITS));
    assert.ok(Object.isFrozen(LIMIT_TABLE));
    assert.throws(() => {
      (DEFAULT_LIMITS as { maxElements: number }).maxElements = 5;
    }, TypeError);
    assert.equal(DEFAULT_LIMITS.maxElements, 1000);
  });

  it("takes each default from the table, and each default lies within its own bounds", () => {
    for (const spec of LIMIT_TABLE) {
      assert.equal(DEFAULT_LIMITS[spec.name], spec.default, spec.name);
      assert.ok(Number.isSafeInteger(spec.default) && Number.isSafeInteger(spec.floor) && Number.isSafeInteger(spec.ceiling), spec.name);
      const floor: number = spec.floor;
      assert.ok(floor >= 1 && floor <= spec.default && spec.default <= spec.ceiling, `${spec.name} default within bounds`);
      assert.ok(spec.unit.length > 0, `${spec.name} has a unit`);
    }
  });

  it("caps the size of a report", () => {
    assert.equal(MAX_REPORTED_DIAGNOSTICS, 100);
  });

  it("keeps the names of the types in step with the table, and Partial<Limits> usable as LayoutLimits", () => {
    assertType<Equal<keyof Limits, LimitName>>(true);
    assertType<Equal<LimitName, (typeof NAMES)[number]>>(true);
    const overrides: Partial<Limits> = { layoutTimeoutMs: 5000 };
    const forLayout: LayoutLimits = overrides;
    assert.equal(forLayout.layoutTimeoutMs, 5000);
  });
});
