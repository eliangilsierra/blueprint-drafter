import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_LIMITS, LIMIT_TABLE, MAX_REPORTED_DIAGNOSTICS, mergeLimits } from "../../src/core/limits/index.js";
import type { Limits } from "../../src/core/limits/index.js";
import { sortDiagnostics } from "../../src/core/model/index.js";
import { only } from "./helpers.js";

/** What a JavaScript caller or a JSON configuration can hand over, which the types do not allow. */
function untyped(value: unknown): Partial<Limits> {
  return value as Partial<Limits>;
}

describe("mergeLimits", () => {
  it("returns the defaults when nothing is overridden", () => {
    for (const result of [mergeLimits(), mergeLimits({}), mergeLimits(untyped({ maxElements: undefined }))]) {
      assert.deepEqual(result.limits, DEFAULT_LIMITS);
      assert.deepEqual(result.diagnostics, []);
    }
  });

  it("applies the given values and keeps the other defaults", () => {
    const { limits, diagnostics } = mergeLimits({ maxElements: 50, layoutTimeoutMs: 2500 });
    assert.deepEqual(diagnostics, []);
    assert.deepEqual({ ...limits }, { ...DEFAULT_LIMITS, maxElements: 50, layoutTimeoutMs: 2500 });
  });

  it("returns frozen limits and never changes DEFAULT_LIMITS or the overrides", () => {
    const overrides = { maxIdChars: 10 };
    const { limits } = mergeLimits(overrides);
    assert.ok(Object.isFrozen(limits));
    assert.deepEqual(overrides, { maxIdChars: 10 });
    assert.equal(DEFAULT_LIMITS.maxIdChars, 64);
    assert.notEqual(limits, DEFAULT_LIMITS);
  });

  it("accepts the floor and the ceiling of every limit (T-AC-1, validation part)", () => {
    for (const spec of LIMIT_TABLE) {
      for (const value of [spec.floor, spec.ceiling]) {
        const result = mergeLimits({ [spec.name]: value });
        assert.deepEqual(result.diagnostics, [], `${spec.name}=${String(value)}`);
        assert.equal(result.limits[spec.name], value);
      }
    }
  });

  it("rejects one below the floor and one above the ceiling of every limit", () => {
    for (const spec of LIMIT_TABLE) {
      for (const value of [spec.floor - 1, spec.ceiling + 1]) {
        const result = mergeLimits({ [spec.name]: value });
        const d = only(result.diagnostics);
        assert.equal(d.code, "E_BAD_VALUE");
        assert.deepEqual(d.ids, [spec.name]);
        assert.ok(d.message.includes(spec.name));
        assert.ok(d.message.includes(String(value)));
        assert.deepEqual(result.limits, DEFAULT_LIMITS);
      }
    }
  });

  it("validates layoutTimeoutMs and layoutWorkerHeapMb as positive integers (T-AC-1)", () => {
    for (const name of ["layoutTimeoutMs", "layoutWorkerHeapMb"] as const) {
      assert.deepEqual(mergeLimits({ [name]: 1 }).diagnostics, []);
      for (const bad of [0, -5, 1.5, Number.NaN]) {
        assert.equal(mergeLimits({ [name]: bad }).diagnostics.length, 1, `${name}=${String(bad)}`);
      }
    }
  });

  it("rejects a non-positive, non-integer, non-finite or non-number override and keeps the defaults (T-AC-2)", () => {
    const bad: unknown[] = [0, -1, -0.5, 0.5, 1.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "10", "", null, true, {}, [], 10n];
    for (const value of bad) {
      const result = mergeLimits(untyped({ maxElements: value }));
      const d = only(result.diagnostics);
      assert.equal(d.code, "E_BAD_VALUE");
      assert.equal(d.severity, "error");
      assert.deepEqual(result.limits, DEFAULT_LIMITS);
      assert.equal(result.limits.maxElements, 1000);
    }
    assert.equal(DEFAULT_LIMITS.maxElements, 1000);
  });

  it("is all or nothing: one rejected override discards the valid ones too", () => {
    const result = mergeLimits(untyped({ maxElements: 10, maxLabelChars: 0, maxIdChars: 1.5 }));
    assert.deepEqual(result.limits, DEFAULT_LIMITS);
    assert.deepEqual(result.diagnostics.map((d) => d.ids), [["maxIdChars"], ["maxLabelChars"]]);
  });

  it("rejects a name that is not a limit instead of ignoring it", () => {
    const result = mergeLimits(untyped({ maxElement: 5 }));
    assert.deepEqual(result.limits, DEFAULT_LIMITS);
    const d = only(result.diagnostics);
    assert.equal(d.code, "E_BAD_VALUE");
    assert.ok(d.message.includes('"maxElement"'));
    assert.ok(d.fix?.includes("maxElements"));
  });

  it("does not let a JSON key reach the prototype", () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"maxElements": 1}, "constructor": 5, "toString": 1}');
    const result = mergeLimits(untyped(parsed));
    assert.deepEqual(result.limits, DEFAULT_LIMITS);
    assert.deepEqual(result.diagnostics.map((d) => d.ids[0]), ["__proto__", "constructor", "toString"]);
    assert.equal(Object.getPrototypeOf(result.limits), Object.prototype);
    assert.equal(({} as { maxElements?: number }).maxElements, undefined);
  });

  it("rejects an overrides value that is not an object", () => {
    for (const value of [null, 5, "maxElements", true]) {
      const result = mergeLimits(untyped(value));
      assert.deepEqual(result.limits, DEFAULT_LIMITS);
      assert.equal(only(result.diagnostics).code, "E_BAD_VALUE");
    }
  });

  it("quotes untrusted text and strips control characters from the ids", () => {
    const result = mergeLimits(untyped({ "bad\u202Ekey\nx": "5\u202E\n; E_FAKE" }));
    const diagnostic = result.diagnostics[0];
    assert.ok(diagnostic !== undefined);
    assert.deepEqual(diagnostic.ids, ["badkeyx"]);
    assert.ok(!diagnostic.message.includes("\n"));
    assert.ok(!diagnostic.message.includes("\u202E"));
    assert.ok(diagnostic.message.includes('"badkey\\nx"'));
    // A rejected string value is echoed only quoted, truncated and stripped, like every untrusted fragment.
    const typed = mergeLimits(untyped({ maxElements: "5\u202E\n; E_FAKE" }));
    assert.ok(typed.diagnostics[0]?.message.includes('"5\\n; E_FAKE"'));
    assert.ok(!(typed.diagnostics[0]?.message.includes("\u202E") ?? true));
  });

  it("does not call methods of an untrusted value", () => {
    let called = false;
    const trap = { toString: () => ((called = true), "x"), valueOf: () => ((called = true), 1) };
    const result = mergeLimits(untyped({ maxElements: trap }));
    assert.equal(called, false);
    assert.ok(result.diagnostics[0]?.message.includes("a value of type object"));
  });

  it("returns diagnostics sorted by the model comparator and identical across runs", () => {
    const overrides = untyped({ zzz: 1, maxLineChars: 0, aaa: 2, maxElements: -1 });
    const first = mergeLimits(overrides);
    const second = mergeLimits(overrides);
    assert.deepEqual(first, second);
    assert.deepEqual(first.diagnostics, sortDiagnostics(first.diagnostics));
    assert.deepEqual(first.diagnostics.map((d) => d.ids[0]), ["aaa", "maxElements", "maxLineChars", "zzz"]);
  });

  it("bounds the size of the report", () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 5 * MAX_REPORTED_DIAGNOSTICS; i++) {
      many[`unknown${String(i)}`] = 1;
    }
    const result = mergeLimits(untyped(many));
    assert.equal(result.diagnostics.length, MAX_REPORTED_DIAGNOSTICS);
    assert.deepEqual(result.limits, DEFAULT_LIMITS);
  });
});
