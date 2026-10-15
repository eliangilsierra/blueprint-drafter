import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DIAGNOSTIC_CODES,
  GEOMETRIC_CODES,
  MAX_FRAGMENT_LENGTH,
  SEMANTIC_CODES,
  SYNTAX_CODES,
  compareDiagnostics,
  createDiagnostic,
  isDiagnosticCode,
  quoteFragment,
  severityOfCode,
  sortDiagnostics,
} from "../../src/core/model/diagnostics.js";
import type { DiagnosticCode, SeverityOfCode } from "../../src/core/model/diagnostics.js";
import type { Diagnostic } from "../../src/core/model/types.js";
import { readText } from "../scaffold/helpers.js";

/** Compile-time check: the call only compiles when `T` is `true`. */
function assertType<T extends true>(value?: T): T | undefined {
  return value;
}
/** Mutual assignability: enough for unions of literals, `keyof` and object types, which is all these tests compare. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

function diag(code: DiagnosticCode, ids: string[], message = "m"): Diagnostic {
  return createDiagnostic(code, ids, message);
}

describe("createDiagnostic (AC-14, type part)", () => {
  it("builds a diagnostic from a code, ids and a message, and derives the severity from the prefix", () => {
    assert.deepEqual(createDiagnostic("E_SYNTAX", ["a"], "bad"), {
      severity: "error",
      code: "E_SYNTAX",
      ids: ["a"],
      message: "bad",
    });
    assert.equal(createDiagnostic("W_UNKNOWN_KIND", ["n"], "m").severity, "warning");
    assert.equal(createDiagnostic("I_ISOLATED", ["n"], "m").severity, "info");
  });

  it("carries fix, auto, line and op when given, including false and 0", () => {
    const d = createDiagnostic("E_UNKNOWN_ID", ["trps"], "no node", { fix: "did you mean trips?", line: 4, op: 0, auto: false });
    assert.deepEqual(d, {
      severity: "error",
      code: "E_UNKNOWN_ID",
      ids: ["trps"],
      message: "no node",
      fix: "did you mean trips?",
      auto: false,
      line: 4,
      op: 0,
    });
  });

  it("leaves the optional parts out instead of setting them to undefined", () => {
    assert.deepEqual(Object.keys(createDiagnostic("I_CROSSINGS", [], "3 crossings")).sort(), [
      "code",
      "ids",
      "message",
      "severity",
    ]);
    assert.deepEqual(Object.keys(createDiagnostic("E_SYNTAX", [], "m", { fix: "f" })).sort(), [
      "code",
      "fix",
      "ids",
      "message",
      "severity",
    ]);
    const json = JSON.stringify(createDiagnostic("E_SYNTAX", ["a"], "m", { line: 2 }));
    assert.equal(json, '{"severity":"error","code":"E_SYNTAX","ids":["a"],"message":"m","line":2}');
  });

  it("copies the ids", () => {
    const ids = ["a", "b"];
    const d = createDiagnostic("E_DANGLING_EDGE", ids, "m");
    ids.push("c");
    assert.deepEqual(d.ids, ["a", "b"]);
  });

  it("cannot be built without a code, ids and a message (compile-time)", () => {
    const typeChecks = (): unknown[] => [
      // @ts-expect-error the message is required
      createDiagnostic("E_SYNTAX", ["a"]),
      // @ts-expect-error the ids are required
      createDiagnostic("E_SYNTAX"),
      // @ts-expect-error the code is required
      createDiagnostic(),
      // @ts-expect-error a code outside the catalogue is rejected
      createDiagnostic("E_NOT_IN_THE_CATALOGUE", [], "m"),
      // @ts-expect-error ids must be a list of strings
      createDiagnostic("E_SYNTAX", "a", "m"),
      // @ts-expect-error a diagnostic literal without a message
      ((): Diagnostic => ({ severity: "error", code: "E_SYNTAX", ids: [] }))(),
      // @ts-expect-error a diagnostic literal without ids
      ((): Diagnostic => ({ severity: "error", code: "E_SYNTAX", message: "m" }))(),
      // @ts-expect-error a diagnostic literal without a code
      ((): Diagnostic => ({ severity: "error", ids: [], message: "m" }))(),
      // @ts-expect-error a severity outside the closed set
      ((): Diagnostic => ({ severity: "fatal", code: "E_SYNTAX", ids: [], message: "m" }))(),
      // @ts-expect-error the severity must match the prefix of the code
      ((): Diagnostic => ({ severity: "info", code: "E_SYNTAX", ids: [], message: "m" }))(),
      // @ts-expect-error the severity must match the prefix of the code
      ((): Diagnostic => ({ severity: "error", code: "W_UNKNOWN_KIND", ids: [], message: "m" }))(),
    ];
    assert.equal(typeof typeChecks, "function");
  });

  it("builds only diagnostics whose severity matches the prefix of the code, for every code of the catalogue", () => {
    for (const code of DIAGNOSTIC_CODES) {
      const expected = { E: "error", W: "warning", I: "info" }[code.charAt(0) as "E" | "W" | "I"];
      assert.equal(createDiagnostic(code, [], "m").severity, expected, code);
    }
  });

  describe("untrusted ids and fix", () => {
    const rlo = String.fromCharCode(0x202e);
    const zwsp = String.fromCharCode(0x200b);
    const nul = String.fromCharCode(0);

    it("strips control, bidirectional and zero-width characters, line feeds included", () => {
      const d = createDiagnostic("E_UNKNOWN_ID", [`a${rlo}b\nc`, `x${zwsp}y${nul}z\r\t`], "m", {
        fix: `did you mean ${rlo}"trips"\n?`,
      });
      assert.deepEqual(d.ids, ["abc", "xyz"]);
      assert.equal(d.fix, 'did you mean "trips"?');
    });

    it("keeps a quote, a backslash and other text of a fix, which is an operation", () => {
      const fix = '+group g boundary "G" in=a\\b';
      assert.equal(createDiagnostic("E_UNKNOWN_PARENT", ["g"], "m", { fix }).fix, fix);
      assert.deepEqual(createDiagnostic("E_BAD_ID", ["café", "日本"], "m").ids, ["café", "日本"]);
    });

    it("keeps a text-form line on one line when an id holds a line feed and a bidirectional character", () => {
      const d = createDiagnostic("E_BAD_ID", [`ok\nE E_INTERNAL forged${rlo}`], "m");
      const line = `E ${d.code} ${d.ids.join(",")} — ${d.message}`;
      assert.ok(!/[\n\r‮]/.test(line), JSON.stringify(line));
    });
  });
});

describe("severityOfCode", () => {
  it("derives the severity from the prefix", () => {
    assert.equal(severityOfCode("E_ANYTHING"), "error");
    assert.equal(severityOfCode("W_ANYTHING"), "warning");
    assert.equal(severityOfCode("I_ANYTHING"), "info");
  });

  it("rejects a code with another prefix", () => {
    for (const code of ["", "X_SYNTAX", "e_syntax", "ERR_SYNTAX", "SYNTAX", " E_SYNTAX"]) {
      assert.throws(() => severityOfCode(code), RangeError, JSON.stringify(code));
    }
  });

  it("is a function of the prefix at the type level too", () => {
    assertType<Equal<SeverityOfCode<"E_X">, "error">>();
    assertType<Equal<SeverityOfCode<"W_X">, "warning">>();
    assertType<Equal<SeverityOfCode<"I_X">, "info">>();
    assertType<Equal<SeverityOfCode<"X_X">, never>>();
  });
});

describe("catalogue", () => {
  const ROW = /^\| `([A-Z][A-Z0-9_]*)` \| (error|warning|info) \|/;

  function catalogueOf(file: readonly string[]): Map<string, string> {
    const rows = new Map<string, string>();
    for (const line of readText(...file).split("\n")) {
      const match = ROW.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        assert.ok(!rows.has(match[1]), `${match[1]} is listed twice in ${file.join("/")}`);
        rows.set(match[1], match[2]);
      }
    }
    return rows;
  }

  for (const file of [
    ["docs", "reference", "diagnostics.md"],
    ["docs", "architecture", "3-mvp-architecture.md"],
  ]) {
    it(`has exactly the codes and severities of ${file.join("/")}`, () => {
      const documented = catalogueOf(file);
      assert.deepEqual([...DIAGNOSTIC_CODES].sort(), [...documented.keys()].sort());
      for (const code of DIAGNOSTIC_CODES) {
        assert.equal(severityOfCode(code), documented.get(code), `severity of ${code}`);
      }
    });
  }

  it("has 61 codes, each once, in the three groups of the catalogue", () => {
    assert.equal(DIAGNOSTIC_CODES.length, 61);
    assert.equal(new Set(DIAGNOSTIC_CODES).size, 61);
    assert.deepEqual([SYNTAX_CODES.length, SEMANTIC_CODES.length, GEOMETRIC_CODES.length], [21, 15, 25]);
    assert.deepEqual(DIAGNOSTIC_CODES, [...SYNTAX_CODES, ...SEMANTIC_CODES, ...GEOMETRIC_CODES]);
  });

  it("is frozen, so no code can change the catalogue at run time", () => {
    for (const list of [SYNTAX_CODES, SEMANTIC_CODES, GEOMETRIC_CODES, DIAGNOSTIC_CODES]) {
      assert.ok(Object.isFrozen(list));
    }
    assert.throws(() => {
      (DIAGNOSTIC_CODES as unknown as string[]).push("E_NOT_IN_THE_CATALOGUE");
    }, TypeError);
    assert.equal(isDiagnosticCode("E_NOT_IN_THE_CATALOGUE"), false);
  });

  it("uses only well-formed code names with a severity prefix", () => {
    for (const code of DIAGNOSTIC_CODES) {
      assert.match(code, /^[EWI]_[A-Z][A-Z0-9_]*$/);
    }
  });

  it("includes the codes that the task names", () => {
    for (const code of ["W_NOT_FOR_TYPE", "E_LABEL_OVERLAPS_EDGE", "E_NOT_REGULAR_FILE"]) {
      assert.ok(isDiagnosticCode(code), code);
    }
  });

  it("tells catalogue codes from other values", () => {
    assert.equal(isDiagnosticCode("E_SYNTAX"), true);
    for (const value of ["E_NOPE", "e_syntax", "", 3, null, undefined, {}]) {
      assert.equal(isDiagnosticCode(value), false);
    }
  });

  it("is a closed union at the type level", () => {
    assertType<Equal<DiagnosticCode, (typeof DIAGNOSTIC_CODES)[number]>>();
    // @ts-expect-error a code outside the catalogue is not a DiagnosticCode
    const unknownCode: DiagnosticCode = "E_NOT_IN_THE_CATALOGUE";
    assert.equal(isDiagnosticCode(unknownCode), false);
  });
});

describe("compareDiagnostics and sortDiagnostics (T-AC-2)", () => {
  // A fresh, deliberately unsorted list for every test: no test can see the effect of another one.
  const mixed = (): Diagnostic[] => [
    diag("I_ISOLATED", ["z"]),
    diag("W_NODES_TOO_CLOSE", ["a", "b"]),
    diag("E_NODE_OVERLAP", ["b", "c"]),
    diag("I_CROSSINGS", []),
    diag("E_DANGLING_EDGE", ["e2"]),
    diag("W_LOW_CONTRAST", ["n1"]),
    diag("E_DANGLING_EDGE", ["e1"]),
    diag("E_NODE_OVERLAP", ["b"]),
    diag("I_ISOLATED", ["a"]),
    diag("W_NODES_TOO_CLOSE", ["a", "a"]),
    diag("E_NODE_OVERLAP", ["B"]),
    diag("E_NODE_OVERLAP", ["\u{1f600}"]),
    diag("E_NODE_OVERLAP", ["～"]),
  ];

  const expectedOrder = [
    ["error", "E_DANGLING_EDGE", ["e1"]],
    ["error", "E_DANGLING_EDGE", ["e2"]],
    ["error", "E_NODE_OVERLAP", ["B"]],
    ["error", "E_NODE_OVERLAP", ["b"]],
    ["error", "E_NODE_OVERLAP", ["b", "c"]],
    ["error", "E_NODE_OVERLAP", ["～"]],
    ["error", "E_NODE_OVERLAP", ["\u{1f600}"]],
    ["warning", "W_LOW_CONTRAST", ["n1"]],
    ["warning", "W_NODES_TOO_CLOSE", ["a", "a"]],
    ["warning", "W_NODES_TOO_CLOSE", ["a", "b"]],
    ["info", "I_CROSSINGS", []],
    ["info", "I_ISOLATED", ["a"]],
    ["info", "I_ISOLATED", ["z"]],
  ] as const;

  const summary = (list: readonly Diagnostic[]): unknown[] => list.map((d) => [d.severity, d.code, d.ids]);

  it("orders by severity (error, warning, info), then code, then ids", () => {
    assert.deepEqual(summary(sortDiagnostics(mixed())), expectedOrder);
  });

  it("puts every error before every warning before every info, whatever the codes", () => {
    const sorted = sortDiagnostics([
      diag("I_ASPECT", []),
      diag("W_EDGE_DETOUR", []),
      diag("E_SYNTAX", []),
      diag("I_CROSSINGS", []),
      diag("E_BAD_ID", []),
    ]);
    assert.deepEqual(
      sorted.map((d) => d.severity),
      ["error", "error", "warning", "info", "info"],
    );
  });

  it("gives the same order when it is sorted twice", () => {
    const once = sortDiagnostics(mixed());
    assert.deepEqual(sortDiagnostics(once), once);
  });

  it("gives the same order whatever the input order", () => {
    const reversed = mixed().reverse();
    const shifted = [...mixed().slice(5), ...mixed().slice(0, 5)];
    const expected = summary(sortDiagnostics(mixed()));
    assert.deepEqual(summary(sortDiagnostics(reversed)), expected);
    assert.deepEqual(summary(sortDiagnostics(shifted)), expected);
  });

  it("does not change its input, whose order is not sorted", () => {
    const input = mixed();
    const snapshot = structuredClone(input);
    assert.notDeepEqual(summary(input), expectedOrder, "the fixture must start unsorted");
    const elements = [...input];
    const sorted = sortDiagnostics(input);
    assert.notEqual(sorted, input, "a new array is returned");
    assert.deepEqual(input, snapshot);
    input.forEach((element, index) => {
      assert.equal(element, elements[index], `element ${String(index)} was replaced`);
    });
    assert.deepEqual(summary(sorted), expectedOrder);
  });

  it("sorts a frozen list and its frozen elements without touching them", () => {
    const input = mixed();
    for (const element of input) {
      Object.freeze(element.ids);
      Object.freeze(element);
    }
    Object.freeze(input);
    assert.deepEqual(summary(sortDiagnostics(input)), expectedOrder);
  });

  it("compares ids by code point, element by element, a shorter list first", () => {
    const base = { severity: "error", code: "E_NODE_OVERLAP", message: "m" } as const;
    assert.ok(compareDiagnostics({ ...base, ids: ["a"] }, { ...base, ids: ["a", "a"] }) < 0);
    assert.ok(compareDiagnostics({ ...base, ids: ["a", "z"] }, { ...base, ids: ["b"] }) < 0);
    assert.equal(compareDiagnostics({ ...base, ids: ["a", "b"] }, { ...base, ids: ["a", "b"] }), 0);
    assert.ok(compareDiagnostics({ ...base, ids: ["～"] }, { ...base, ids: ["\u{1f600}"] }) < 0);
  });

  it("keeps diagnostics that are equal under the order in their input order", () => {
    const first = createDiagnostic("E_UNKNOWN_ID", ["x"], "first", { op: 1 });
    const second = createDiagnostic("E_UNKNOWN_ID", ["x"], "second", { op: 3 });
    assert.deepEqual(sortDiagnostics([first, second]).map((d) => d.message), ["first", "second"]);
    assert.deepEqual(sortDiagnostics([second, first]).map((d) => d.message), ["second", "first"]);
  });
});

describe("quoteFragment (T-AC-4)", () => {
  it("wraps plain text in double quotes", () => {
    assert.equal(quoteFragment("trps"), '"trps"');
    assert.equal(quoteFragment("~node trps"), '"~node trps"');
    assert.equal(quoteFragment(""), '""');
    assert.equal(quoteFragment("café 日本 \u{1f600}"), '"café 日本 \u{1f600}"');
  });

  it("escapes quotes and backslashes with the string escapes of the format", () => {
    assert.equal(quoteFragment('say "hi"'), '"say \\"hi\\""');
    assert.equal(quoteFragment("a\\b"), '"a\\\\b"');
    assert.equal(quoteFragment('\\"'), '"\\\\\\""');
  });

  it("writes a line feed as the \\n escape", () => {
    assert.equal(quoteFragment("a\nb"), '"a\\nb"');
  });

  it("strips control characters", () => {
    for (const code of [0x00, 0x01, 0x07, 0x08, 0x09, 0x0b, 0x0c, 0x0d, 0x1b, 0x1f, 0x7f, 0x80, 0x85, 0x9f]) {
      const text = `a${String.fromCharCode(code)}b`;
      assert.equal(quoteFragment(text), '"ab"', `U+${code.toString(16).padStart(4, "0")}`);
    }
  });

  it("strips bidirectional controls U+202A to U+202E and U+2066 to U+2069", () => {
    const bidi = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
    for (const code of bidi) {
      assert.equal(quoteFragment(`a${String.fromCharCode(code)}b`), '"ab"', `U+${code.toString(16)}`);
    }
    assert.equal(quoteFragment(`user${String.fromCharCode(0x202e)}gpj.exe`), '"usergpj.exe"');
  });

  it("strips the other bidirectional marks", () => {
    for (const code of [0x061c, 0x200e, 0x200f]) {
      assert.equal(quoteFragment(`a${String.fromCharCode(code)}b`), '"ab"', `U+${code.toString(16)}`);
    }
  });

  it("strips zero-width characters", () => {
    for (const code of [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]) {
      assert.equal(quoteFragment(`a${String.fromCharCode(code)}b`), '"ab"', `U+${code.toString(16)}`);
    }
  });

  it("strips line and paragraph separators, tag characters, noncharacters and lone surrogates", () => {
    const hidden = [" ", " ", "\u{e0041}", "￾", "￿", "﷐", "\u{1fffe}", "\ud800", "\udc00"];
    for (const character of hidden) {
      assert.equal(quoteFragment(`a${character}b`), '"ab"', JSON.stringify(character));
    }
  });

  it("keeps a valid surrogate pair", () => {
    assert.equal(quoteFragment("a😀b"), '"a\u{1f600}b"');
  });

  it("strips before it measures", () => {
    assert.equal(quoteFragment(`${"​".repeat(500)}ab${"‮".repeat(500)}`), '"ab"');
  });

  it("truncates 200 characters to at most 80 plus the quotes, ending with an ellipsis", () => {
    const result = quoteFragment("x".repeat(200));
    assert.equal(result, `"${"x".repeat(79)}…"`);
    assert.ok(result.length <= MAX_FRAGMENT_LENGTH + 2);
  });

  it("leaves 80 characters alone and truncates 81", () => {
    assert.equal(quoteFragment("y".repeat(80)), `"${"y".repeat(80)}"`);
    assert.equal(quoteFragment("y".repeat(81)), `"${"y".repeat(79)}…"`);
    assert.equal(quoteFragment("y".repeat(79)), `"${"y".repeat(79)}"`);
  });

  it("counts the escapes toward the limit and never cuts one in half", () => {
    const quoted = quoteFragment('"'.repeat(200));
    assert.ok(quoted.length <= MAX_FRAGMENT_LENGTH + 2, String(quoted.length));
    assert.match(quoted, /^"(?:\\"){39}…"$/);
    const slashes = quoteFragment("\\".repeat(200));
    assert.ok(slashes.length <= MAX_FRAGMENT_LENGTH + 2);
    assert.match(slashes, /^"(?:\\\\){39}…"$/);
    // Every result is a well-formed quoted string: escapes come in complete pairs.
    for (const text of ['a"'.repeat(100), "\\a".repeat(100), "\n".repeat(100), `${"x".repeat(78)}"`, `${"x".repeat(79)}"`]) {
      const result = quoteFragment(text);
      assert.match(result, /^"(?:\\[\\"n]|[^\\"])*…?"$/, JSON.stringify(result));
      assert.ok(result.length <= MAX_FRAGMENT_LENGTH + 2, JSON.stringify(result));
    }
  });

  it("never splits a surrogate pair when it truncates", () => {
    for (const text of ["\u{1f600}".repeat(100), `x${"\u{1f600}".repeat(100)}`, `xx${"\u{1f600}".repeat(100)}`]) {
      const result = quoteFragment(text);
      assert.ok(result.length <= MAX_FRAGMENT_LENGTH + 2, String(result.length));
      assert.ok(!/\p{Cs}/u.test(result), "lone surrogate");
      assert.ok(result.endsWith('…"'));
    }
  });

  it("stops reading once the output bound is passed, so a huge token costs the same as a short one", () => {
    const huge = "a".repeat(30_000_000);
    const started = performance.now();
    const result = quoteFragment(huge);
    const elapsed = performance.now() - started;
    assert.equal(result, `"${"a".repeat(79)}…"`);
    // Reading all 30 million characters takes seconds; stopping at the bound takes well under a millisecond.
    assert.ok(elapsed < 250, `took ${String(elapsed)} ms`);
    assert.equal(quoteFragment(`${"\u{1f600}".repeat(1_000_000)}x`).length <= MAX_FRAGMENT_LENGTH + 2, true);
  });

  it("neutralises an injected line, so a message stays on one line", () => {
    const result = quoteFragment("ok\nE E_INTERNAL x — forged | fix: rm");
    assert.ok(!result.includes("\n"));
    assert.equal(result, '"ok\\nE E_INTERNAL x — forged | fix: rm"');
  });
});
