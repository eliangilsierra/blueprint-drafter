import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareCodePoints,
  derivedEdgeId,
  formatNumber,
  isDerivedRef,
  stableHash,
} from "../../src/core/model/util.js";

describe("formatNumber (T-AC-1)", () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [0, "0.00"],
    [3, "3.00"],
    [2.5, "2.50"],
    [1.234, "1.23"],
    [1.235, "1.24"],
    [123456.789, "123456.79"],
    [-1.5, "-1.50"],
    [-0.005, "-0.01"],
    [0.1 + 0.2, "0.30"],
    [1e20, "100000000000000000000.00"],
    // Rounding follows the exact binary value, so these are deterministic rather than "round half up on the text".
    [1.005, "1.00"],
    [0.005, "0.01"],
  ];
  for (const [input, expected] of cases) {
    it(`formats ${String(input)} as ${expected}`, () => {
      assert.equal(formatNumber(input), expected);
    });
  }

  it("never prints -0", () => {
    assert.equal(formatNumber(-0), "0.00");
    assert.equal(formatNumber(-0.001), "0.00");
    assert.equal(formatNumber(-0.004), "0.00");
    assert.equal(formatNumber(-0.0049999), "0.00");
    for (const input of [-0, -1e-9, -0.004, 0, 0.004, -Number.MIN_VALUE]) {
      assert.ok(!formatNumber(input).includes("-"), `${String(input)} printed a sign`);
    }
  });

  it("returns the same text for the same input on every call", () => {
    for (const input of [0, -0, 0.1 + 0.2, 1.005, -12.345, 1e20]) {
      assert.equal(formatNumber(input), formatNumber(input));
    }
  });

  it("always has exactly two decimals", () => {
    for (const input of [0, 1, 10.1, 99.999, -3.14159, 1e-7]) {
      assert.match(formatNumber(input), /^-?\d+\.\d{2}$/);
    }
  });

  it("rejects values that cannot be printed deterministically", () => {
    for (const input of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e21, -1e21]) {
      assert.throws(() => formatNumber(input), RangeError, String(input));
    }
  });
});

describe("compareCodePoints (T-AC-1)", () => {
  const ordered: readonly string[] = [
    "",
    "A",
    "B",
    "Z",
    "_",
    "a",
    "a.b",
    "a1",
    "ab",
    "abc",
    "b",
    "z",
    "é", // é
    "ä", // ä sorts after z by code point, before z in most locales
  ];

  it("orders by code point", () => {
    const expected = [...ordered].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    assert.deepEqual([...ordered].reverse().sort(compareCodePoints), expected);
  });

  const cases: ReadonlyArray<readonly [string, string, -1 | 0 | 1]> = [
    ["a", "a", 0],
    ["", "", 0],
    ["a", "b", -1],
    ["b", "a", 1],
    ["", "a", -1],
    ["a", "", 1],
    ["ab", "abc", -1],
    ["abc", "ab", 1],
    // Mixed-case ids: upper case sorts before lower case.
    ["B", "a", -1],
    ["Api", "api", -1],
    ["api", "Api", 1],
    ["node2", "node10", 1],
    // Non-ASCII ids.
    ["z", "ä", -1],
    ["ä", "z", 1],
    ["café", "cafe", 1],
    ["日本", "日本", 0],
    ["あ", "い", -1],
    // Astral characters sort after U+E000 to U+FFFF by code point; UTF-16 code unit order says the opposite.
    ["～", "\u{1f600}", -1],
    ["\u{1f600}", "～", 1],
    ["", "\u{10000}", -1],
    ["\u{1f600}a", "\u{1f600}b", -1],
    ["\u{1f600}", "\u{1f600}", 0],
  ];
  for (const [a, b, expected] of cases) {
    it(`compares ${JSON.stringify(a)} with ${JSON.stringify(b)} as ${String(expected)}`, () => {
      assert.equal(compareCodePoints(a, b), expected);
    });
  }

  it("is antisymmetric on every pair of the table", () => {
    const values = cases.flatMap(([a, b]) => [a, b]);
    for (const a of values) {
      for (const b of values) {
        assert.equal(compareCodePoints(a, b), -compareCodePoints(b, a) || 0, `${a} / ${b}`);
      }
    }
  });

  it("does not depend on the locale", () => {
    const words = ["z", "ä", "a"];
    assert.deepEqual([...words].sort(compareCodePoints), ["a", "z", "ä"]);
    // localeCompare puts ä between a and z, so using it for ordering would change the output with the locale.
    assert.notDeepEqual([...words].sort(compareCodePoints), [...words].sort((x, y) => x.localeCompare(y, "de")));
  });
});

describe("stableHash", () => {
  it("matches the published FNV-1a 64-bit test vectors", () => {
    assert.equal(stableHash(""), "cbf29ce484222325");
    assert.equal(stableHash("a"), "af63dc4c8601ec8c");
    assert.equal(stableHash("foobar"), "85944171f73967e8");
  });

  it("is 16 lowercase hex digits and repeatable", () => {
    for (const input of ["", "api", "api>db", "café", "\u{1f600}", "x".repeat(10_000)]) {
      assert.match(stableHash(input), /^[0-9a-f]{16}$/);
      assert.equal(stableHash(input), stableHash(input));
    }
  });

  it("hashes the UTF-8 bytes, so distinct texts differ", () => {
    const inputs = ["api", "Api", "api>db", "db>api", "api>db#2", "café", "café", "é", "e"];
    assert.equal(new Set(inputs.map(stableHash)).size, inputs.length);
  });
});

describe("derivedEdgeId (T-AC-5)", () => {
  it("returns from>to when it is free", () => {
    assert.equal(derivedEdgeId("a", "b", new Set()), "a>b");
    assert.equal(derivedEdgeId("a", "b", new Set(["b>a", "a>c", "a>b2"])), "a>b");
  });

  it("returns the lowest free a>b#n with n >= 2", () => {
    assert.equal(derivedEdgeId("a", "b", new Set(["a>b"])), "a>b#2");
    assert.equal(derivedEdgeId("a", "b", new Set(["a>b", "a>b#2"])), "a>b#3");
    assert.equal(derivedEdgeId("a", "b", new Set(["a>b", "a>b#2", "a>b#3"])), "a>b#4");
  });

  it("fills a gap left by a removed sibling", () => {
    assert.equal(derivedEdgeId("a", "b", new Set(["a>b", "a>b#3"])), "a>b#2");
  });

  it("takes a>b when it is free even if higher numbers are taken", () => {
    assert.equal(derivedEdgeId("a", "b", new Set(["a>b#2"])), "a>b");
  });

  it("never returns #1, whether or not it is in the set", () => {
    assert.equal(derivedEdgeId("a", "b", new Set(["a>b", "a>b#1"])), "a>b#2");
    const taken = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const id = derivedEdgeId("a", "b", taken);
      assert.ok(!id.endsWith("#1"), id);
      taken.add(id);
    }
    assert.deepEqual([...taken].slice(0, 4), ["a>b", "a>b#2", "a>b#3", "a>b#4"]);
    assert.equal(taken.size, 25);
  });

  it("keeps no state and does not change the set", () => {
    const taken = new Set(["a>b"]);
    assert.equal(derivedEdgeId("a", "b", taken), "a>b#2");
    assert.equal(derivedEdgeId("a", "b", taken), "a>b#2");
    assert.deepEqual([...taken], ["a>b"]);
  });

  it("is case sensitive and handles non-ASCII ids", () => {
    assert.equal(derivedEdgeId("A", "b", new Set(["a>b"])), "A>b");
    assert.equal(derivedEdgeId("café", "bar", new Set(["café>bar"])), "café>bar#2");
  });

  it("produces ids that isDerivedRef accepts", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const id = derivedEdgeId("src", "dst", taken);
      assert.ok(isDerivedRef(id), id);
      taken.add(id);
    }
  });
});

describe("isDerivedRef", () => {
  it("accepts from>to and from>to#n with n >= 2", () => {
    for (const id of ["a>b", "a>b#2", "a>b#9", "a>b#10", "a>b#123", "api.v1>db-main", "_x>y_1", "café>bar#2"]) {
      assert.equal(isDerivedRef(id), true, id);
    }
  });

  it("rejects #1 and other forms of the suffix", () => {
    for (const id of ["a>b#1", "a>b#0", "a>b#01", "a>b#02", "a>b#", "a>b#x", "a>b#2#3", "a>b#-2", "a>b#2.5"]) {
      assert.equal(isDerivedRef(id), false, id);
    }
  });

  it("rejects explicit ids and malformed references", () => {
    for (const id of ["", "a", "my-edge.1", "a>", ">b", ">", "a>b>c", "a b>c", "a>b c", "a>b\n", "a#2>b"]) {
      assert.equal(isDerivedRef(id), false, JSON.stringify(id));
    }
  });
});
