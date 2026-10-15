import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LIMITS,
  MAX_PNG_SCALE,
  MAX_REPORTED_DIAGNOSTICS,
  checkBatch,
  checkDiagram,
  checkFileCount,
  checkIdLength,
  checkPngSize,
  checkRawText,
} from "../../src/core/limits/index.js";
import { sortDiagnostics } from "../../src/core/model/index.js";
import type { Diagnostic } from "../../src/core/model/index.js";
import { diagram, edge, group, groupChain, limitsWith, node, only } from "./helpers.js";

const L = DEFAULT_LIMITS;

function assertExceeded(d: Diagnostic, limit: string, value: number, maximum: number): void {
  assert.equal(d.code, "E_LIMIT_EXCEEDED");
  assert.equal(d.severity, "error");
  assert.equal(d.fix, "Split the diagram into views");
  assert.ok(d.message.startsWith(`${limit} exceeded: `), d.message);
  assert.ok(d.message.includes(`${String(value)} `), `${d.message} names the value ${String(value)}`);
  assert.ok(d.message.endsWith(`maximum ${String(maximum)}`), `${d.message} names the maximum ${String(maximum)}`);
}

/** A text of `bytes` ASCII bytes made of lines short enough for the default line limit. */
function textOfBytes(bytes: number): string {
  const line = `${"a".repeat(1023)}\n`;
  const whole = Math.floor(bytes / line.length);
  return line.repeat(whole) + "b".repeat(bytes - whole * line.length);
}

describe("checkRawText: bytes (maxFileBytes)", () => {
  it("accepts exactly 1 MiB and rejects 1 MiB + 1 byte (T-AC-3)", () => {
    assert.deepEqual(checkRawText(textOfBytes(1_048_575), L), []);
    assert.deepEqual(checkRawText(textOfBytes(1_048_576), L), []);
    assertExceeded(only(checkRawText(textOfBytes(1_048_577), L)), "maxFileBytes", 1_048_577, 1_048_576);
  });

  it("counts UTF-8 bytes, not characters", () => {
    const limits = limitsWith({ maxFileBytes: 4 });
    assert.deepEqual(checkRawText("\u00E9\u00E9", limits), []); // 2 + 2 bytes
    assertExceeded(only(checkRawText("\u00E9\u00E9a", limits)), "maxFileBytes", 5, 4);
    assert.deepEqual(checkRawText("\u{1F600}", limits), []); // 4 bytes, 2 UTF-16 units
    assertExceeded(only(checkRawText("\u{1F600}a", limits)), "maxFileBytes", 5, 4);
    assertExceeded(only(checkRawText("\u20AC\u20AC", limits)), "maxFileBytes", 6, 4); // 3 bytes each
    assertExceeded(only(checkRawText("\ud800\ud800", limits)), "maxFileBytes", 6, 4); // a lone surrogate decodes to U+FFFD
  });

  it("honours an overridden limit", () => {
    assert.deepEqual(checkRawText("abc", limitsWith({ maxFileBytes: 3 })), []);
    assertExceeded(only(checkRawText("abcd", limitsWith({ maxFileBytes: 3 }))), "maxFileBytes", 4, 3);
  });

  it("reports the size only, and does not scan the lines of a text that is too large", () => {
    const huge = `${"a".repeat(5000)}\n`.repeat(300);
    const found = checkRawText(huge, L);
    assert.equal(only(found).message.startsWith("maxFileBytes"), true);
    assert.equal(found[0]?.line, undefined);
  });
});

describe("checkRawText: longest line (maxLineChars)", () => {
  it("accepts a line of 4,096 characters and rejects one of 4,097 before any tokenizing (T-AC-3)", () => {
    assert.deepEqual(checkRawText("a".repeat(4095), L), []);
    assert.deepEqual(checkRawText("a".repeat(4096), L), []);
    assertExceeded(only(checkRawText("a".repeat(4097), L)), "maxLineChars", 4097, 4096);
  });

  it("names the 1-based line of the first line that is too long and reports no other", () => {
    const text = `ok\n${"a".repeat(4096)}\n${"b".repeat(4097)}\nshort\n${"c".repeat(9000)}\n`;
    const d = only(checkRawText(text, L));
    assertExceeded(d, "maxLineChars", 4097, 4096);
    assert.equal(d.line, 3);
    assert.ok(d.message.includes("line 3"));
  });

  it("checks the last line without a final newline, and an empty text", () => {
    assert.deepEqual(checkRawText("", L), []);
    assert.deepEqual(checkRawText("\n\n", L), []);
    assertExceeded(only(checkRawText(`x\n${"a".repeat(4097)}`, L)), "maxLineChars", 4097, 4096);
    assert.equal(only(checkRawText(`x\n${"a".repeat(4097)}`, L)).line, 2);
  });

  it("does not count the CR of a CRLF line ending", () => {
    assert.deepEqual(checkRawText(`${"a".repeat(4096)}\r\n${"b".repeat(4096)}\r\n`, L), []);
    const d = only(checkRawText(`${"a".repeat(4097)}\r\n`, L));
    assertExceeded(d, "maxLineChars", 4097, 4096);
    // A CR that ends no line is a character of the line.
    assertExceeded(only(checkRawText(`${"a".repeat(4096)}\r`, L)), "maxLineChars", 4097, 4096);
    assertExceeded(only(checkRawText(`${"a".repeat(4096)}\r\r\n`, L)), "maxLineChars", 4097, 4096);
  });

  it("does not count a leading byte-order mark", () => {
    assert.deepEqual(checkRawText(`\uFEFF${"a".repeat(4096)}`, L), []);
    assertExceeded(only(checkRawText(`\uFEFF${"a".repeat(4097)}`, L)), "maxLineChars", 4097, 4096);
    // Only at the start of the text.
    assertExceeded(only(checkRawText(`x\n\uFEFF${"a".repeat(4096)}`, L)), "maxLineChars", 4097, 4096);
  });

  it("counts UTF-16 code units", () => {
    const limits = limitsWith({ maxLineChars: 4 });
    assert.deepEqual(checkRawText("\u{1F600}\u{1F600}", limits), []);
    assertExceeded(only(checkRawText("\u{1F600}\u{1F600}a", limits)), "maxLineChars", 5, 4);
  });

  it("honours an overridden limit", () => {
    assertExceeded(only(checkRawText("abcd", limitsWith({ maxLineChars: 3 }))), "maxLineChars", 4, 3);
  });
});

describe("checkIdLength and the id limit (maxIdChars)", () => {
  // Open question: #56 (row 14 of PR #64): the assumed default is E_LIMIT_EXCEEDED, never E_BAD_ID.
  it("accepts 64 characters and rejects 65 with E_LIMIT_EXCEEDED naming maxIdChars, never E_BAD_ID", () => {
    assert.equal(checkIdLength("a".repeat(63), L), undefined);
    assert.equal(checkIdLength("a".repeat(64), L), undefined);
    const d = checkIdLength("a".repeat(65), L);
    assert.ok(d !== undefined);
    assertExceeded(d, "maxIdChars", 65, 64);
    assert.notEqual(d.code, "E_BAD_ID");
    assert.deepEqual(d.ids, ["a".repeat(65)]);
  });

  it("quotes the id in the message and passes the extras through", () => {
    const d = checkIdLength(`${"a".repeat(100)}\u202E"\n`, L, { line: 7 });
    assert.ok(d !== undefined);
    assert.equal(d.line, 7);
    assert.ok(!d.message.includes("\u202E"));
    assert.ok(!d.message.includes("\n"));
    assert.ok(d.message.includes("\u2026"), "a long id is truncated by quoteFragment");
    assert.ok(d.message.length < 200);
  });

  it("applies to groups, nodes and explicit edge ids of a diagram", () => {
    const long = "x".repeat(65);
    const ok = "x".repeat(64);
    const d = diagram({
      groups: [group(ok), group(long)],
      nodes: [node(ok), node(`n${long}`)],
      edges: [edge("a", "b", { id: ok, explicitId: true }), edge("a", "b", { id: long, explicitId: true })],
    });
    const found = checkDiagram(d, L);
    assert.deepEqual(found.map((x) => x.ids[0]), [long, `n${long}`, long].sort());
    for (const x of found) {
      assertExceeded(x, "maxIdChars", x.ids[0]?.length ?? 0, 64);
    }
  });

  it("does not count a derived edge id, which is made of two ids checked as elements", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const d = diagram({ nodes: [node(a), node(b)], edges: [edge(a, b)] });
    assert.ok(edge(a, b).id.length > 64);
    assert.deepEqual(checkDiagram(d, L), []);
  });
});

describe("checkDiagram: elements (maxElements, AC-45 unit part)", () => {
  function withElements(groups: number, nodes: number, edges: number) {
    return diagram({
      groups: Array.from({ length: groups }, (_, i) => group(`g${String(i)}`)),
      nodes: Array.from({ length: nodes }, (_, i) => node(`n${String(i)}`)),
      edges: Array.from({ length: edges }, (_, i) => edge("a", "b", { id: `e${String(i)}` })),
    });
  }

  it("rejects 1,001 elements naming maxElements, the value and the maximum", () => {
    const d = only(checkDiagram(withElements(1, 700, 300), L));
    assertExceeded(d, "maxElements", 1001, 1000);
    assert.deepEqual(d.ids, []);
  });

  it("accepts 999 and 1,000 elements, counted as groups + nodes + edges", () => {
    assert.deepEqual(checkDiagram(withElements(0, 999, 0), L), []);
    assert.deepEqual(checkDiagram(withElements(100, 400, 500), L), []);
    assert.deepEqual(checkDiagram(withElements(0, 0, 1000), L), []);
    assertExceeded(only(checkDiagram(withElements(0, 0, 1001), L)), "maxElements", 1001, 1000);
    assertExceeded(only(checkDiagram(withElements(1001, 0, 0), L)), "maxElements", 1001, 1000);
    assertExceeded(only(checkDiagram(withElements(333, 334, 334), L)), "maxElements", 1001, 1000);
  });

  it("examines nothing else when the diagram has too many elements", () => {
    const tooMany = withElements(0, 1001, 0);
    tooMany.nodes[0] = node("x".repeat(100), { label: "l".repeat(900) });
    assert.equal(only(checkDiagram(tooMany, L)).message.startsWith("maxElements"), true);
  });

  it("honours an overridden limit", () => {
    assertExceeded(only(checkDiagram(withElements(0, 3, 0), limitsWith({ maxElements: 2 }))), "maxElements", 3, 2);
    assert.deepEqual(checkDiagram(withElements(0, 2, 0), limitsWith({ maxElements: 2 })), []);
  });

  it("accepts an empty diagram", () => {
    assert.deepEqual(checkDiagram(diagram(), L), []);
  });
});

describe("checkDiagram: label, desc and tech (maxLabelChars)", () => {
  const at = (n: number): string => "x".repeat(n);

  it("accepts 500 characters and rejects 501 in every text field of every element", () => {
    const fine = diagram({
      groups: [group("g", { label: at(500), desc: at(500) })],
      nodes: [node("n", { label: at(500), desc: at(500), tech: at(500) })],
      edges: [edge("n", "n", { label: at(500), tech: at(500) })],
    });
    assert.deepEqual(checkDiagram(fine, L), []);

    const cases: [string, ReturnType<typeof diagram>, string, string][] = [
      ["group label", diagram({ groups: [group("g", { label: at(501) })] }), "g", "label"],
      ["group desc", diagram({ groups: [group("g", { desc: at(501) })] }), "g", "desc"],
      ["node label", diagram({ nodes: [node("n", { label: at(501) })] }), "n", "label"],
      ["node desc", diagram({ nodes: [node("n", { desc: at(501) })] }), "n", "desc"],
      ["node tech", diagram({ nodes: [node("n", { tech: at(501) })] }), "n", "tech"],
      ["edge label", diagram({ edges: [edge("a", "b", { label: at(501) })] }), "a>b", "label"],
      ["edge tech", diagram({ edges: [edge("a", "b", { tech: at(501) })] }), "a>b", "tech"],
    ];
    for (const [name, d, id, field] of cases) {
      const found = only(checkDiagram(d, L));
      assertExceeded(found, "maxLabelChars", 501, 500);
      assert.deepEqual(found.ids, [id], name);
      assert.ok(found.message.includes(`${field} of "${id}"`), `${name}: ${found.message}`);
    }
  });

  it("checks each field on its own and reports one diagnostic per field", () => {
    const d = diagram({ nodes: [node("n", { label: at(501), desc: at(600), tech: at(500) })] });
    const found = checkDiagram(d, L);
    assert.equal(found.length, 2);
    assert.deepEqual(found.map((x) => x.message.includes("501 ") || x.message.includes("600 ")), [true, true]);
  });

  it("never echoes the text of a label, description or tech value", () => {
    const secret = "SECRET-LABEL-TEXT";
    const d = diagram({ nodes: [node("n", { label: secret + at(600), desc: secret + at(600), tech: secret + at(600) })] });
    for (const found of checkDiagram(d, L)) {
      assert.ok(!found.message.includes(secret));
      assert.ok(!(found.fix ?? "").includes(secret));
      assert.ok(!found.ids.some((id) => id.includes(secret)));
    }
  });

  it("counts UTF-16 code units and honours an overridden limit", () => {
    const limits = limitsWith({ maxLabelChars: 4 });
    assert.deepEqual(checkDiagram(diagram({ nodes: [node("n", { label: "\u{1F600}\u{1F600}" })] }), limits), []);
    assertExceeded(only(checkDiagram(diagram({ nodes: [node("n", { label: "\u{1F600}\u{1F600}a" })] }), limits)), "maxLabelChars", 5, 4);
  });

  it("quotes an id with control characters in the message and strips it in ids", () => {
    const d = diagram({ nodes: [node("n\u202E\nx", { label: at(501) })] });
    const found = only(checkDiagram(d, L));
    assert.deepEqual(found.ids, ["nx"]);
    assert.ok(found.message.includes('label of "n\\nx"'));
  });
});

describe("checkDiagram: group depth (maxGroupDepth)", () => {
  it("accepts a chain of 16 groups and rejects the 17th, naming only the group that is too deep", () => {
    assert.deepEqual(checkDiagram(diagram({ groups: groupChain(15) }), L), []);
    assert.deepEqual(checkDiagram(diagram({ groups: groupChain(16) }), L), []);
    const found = checkDiagram(diagram({ groups: groupChain(17) }), L);
    const d = only(found);
    assertExceeded(d, "maxGroupDepth", 17, 16);
    assert.deepEqual(d.ids, ["g17"]);
    const deeper = checkDiagram(diagram({ groups: groupChain(19) }), L);
    assert.deepEqual(deeper.map((x) => x.ids[0]), ["g17", "g18", "g19"]);
    assert.deepEqual(deeper.map((x) => x.message.includes(` ${String(17 + deeper.indexOf(x))} `)), [true, true, true]);
  });

  it("does not count a node as a level, and does not depend on the order of the groups", () => {
    const sixteen = groupChain(16);
    const withNode = diagram({ groups: sixteen, nodes: [node("deep", { in: "g16" })] });
    assert.deepEqual(checkDiagram(withNode, L), []);
    const reversed = diagram({ groups: groupChain(17).reverse() });
    assert.deepEqual(only(checkDiagram(reversed, L)).ids, ["g17"]);
  });

  it("measures several branches independently", () => {
    const groups = [...groupChain(16), group("side", { in: "g1" }), group("side2", { in: "side" })];
    assert.deepEqual(checkDiagram(diagram({ groups }), L), []);
  });

  it("honours an overridden limit", () => {
    const limits = limitsWith({ maxGroupDepth: 2 });
    assert.deepEqual(checkDiagram(diagram({ groups: groupChain(2) }), limits), []);
    assertExceeded(only(checkDiagram(diagram({ groups: groupChain(3) }), limits)), "maxGroupDepth", 3, 2);
  });

  it("terminates on a containment cycle and leaves it to E_CONTAINMENT_CYCLE", () => {
    const cycle = diagram({ groups: [group("a", { in: "b" }), group("b", { in: "a" }), group("self", { in: "self" })] });
    assert.deepEqual(checkDiagram(cycle, L), []);
    // A group below a cycle is not measured either; a healthy group elsewhere still is.
    const mixed = diagram({ groups: [group("a", { in: "b" }), group("b", { in: "a" }), group("c", { in: "a" }), ...groupChain(17).map((g) => ({ ...g, id: `h${g.id}`, ...(g.in === undefined ? {} : { in: `h${g.in}` }) }))] });
    assert.deepEqual(checkDiagram(mixed, L).map((x) => x.ids[0]), ["hg17"]);
  });

  it("treats a parent that is missing or is not a group as the top level", () => {
    const d = diagram({ groups: [group("a", { in: "missing" }), group("b", { in: "n" })], nodes: [node("n")] });
    assert.deepEqual(checkDiagram(d, L), []);
  });

  it("uses the first group of a duplicated id", () => {
    const d = diagram({ groups: [group("a"), group("a", { in: "a" })] });
    assert.deepEqual(checkDiagram(d, L), []);
  });
});

describe("checkDiagram: order, bounds and determinism", () => {
  it("returns diagnostics sorted by the comparator of the model (code, then ids), identical across runs", () => {
    const d = diagram({
      groups: [group("z", { label: "x".repeat(501) })],
      nodes: [node("b", { label: "x".repeat(501) }), node("a".repeat(65), { label: "x".repeat(501) }), node("a", { label: "x".repeat(501) })],
      edges: [edge("a", "b", { tech: "x".repeat(501) })],
    });
    const first = checkDiagram(d, L);
    const second = checkDiagram(d, L);
    assert.deepEqual(first, second);
    assert.deepEqual(first, sortDiagnostics(first));
    assert.deepEqual(first.map((x) => x.ids[0]), ["a", "a>b", "a".repeat(65), "a".repeat(65), "b", "z"]);
  });

  it("returns at most MAX_REPORTED_DIAGNOSTICS findings, the first ones in the order of the diagram", () => {
    const nodes = Array.from({ length: 300 }, (_, i) => node(`n${String(1000 + i)}`, { label: "x".repeat(501) }));
    const found = checkDiagram(diagram({ nodes }), L);
    assert.equal(found.length, MAX_REPORTED_DIAGNOSTICS);
    assert.equal(found[0]?.ids[0], "n1000");
    assert.equal(found.at(-1)?.ids[0], `n${String(1000 + MAX_REPORTED_DIAGNOSTICS - 1)}`);
  });

  it("does not modify the diagram", () => {
    const d = diagram({ groups: groupChain(18), nodes: [node("n", { label: "x".repeat(600) })], edges: [edge("n", "n")] });
    const before = structuredClone(d);
    checkDiagram(d, L);
    assert.deepEqual(d, before);
  });
});

describe("checkBatch (maxOpsPerBatch, maxOpsBytes)", () => {
  it("accepts 1,000 operations and rejects 1,001, before any operation runs", () => {
    assert.deepEqual(checkBatch(Array.from({ length: 999 }, () => "-node a"), L), []);
    assert.deepEqual(checkBatch(Array.from({ length: 1000 }, () => "-node a"), L), []);
    const d = only(checkBatch(Array.from({ length: 1001 }, () => "-node a"), L));
    assertExceeded(d, "maxOpsPerBatch", 1001, 1000);
  });

  it("accepts 1 MiB of operations and rejects 1 MiB + 1 byte", () => {
    assert.deepEqual(checkBatch(["x".repeat(1_048_575)], L), []);
    assert.deepEqual(checkBatch(["x".repeat(1_048_576)], L), []);
    assertExceeded(only(checkBatch(["x".repeat(1_048_577)], L)), "maxOpsBytes", 1_048_577, 1_048_576);
  });

  it("adds up the operations and counts UTF-8 bytes", () => {
    const limits = limitsWith({ maxOpsBytes: 8 });
    assert.deepEqual(checkBatch(["abcd", "\u00E9\u00E9"], limits), []);
    assertExceeded(only(checkBatch(["abcd", "\u00E9\u00E9a"], limits)), "maxOpsBytes", 9, 8);
    assertExceeded(only(checkBatch(["a", "b", "c", "d", "e", "f", "g", "h", "i"], limits)), "maxOpsBytes", 9, 8);
  });

  it("checks the count first and reports only it when both are exceeded", () => {
    const limits = limitsWith({ maxOpsPerBatch: 2, maxOpsBytes: 3 });
    assertExceeded(only(checkBatch(["abcd", "e", "f"], limits)), "maxOpsPerBatch", 3, 2);
    assertExceeded(only(checkBatch(["abcd", "e"], limits)), "maxOpsBytes", 5, 3);
  });

  it("accepts an empty batch", () => {
    assert.deepEqual(checkBatch([], L), []);
  });
});

describe("checkFileCount (maxFiles)", () => {
  it("accepts 10,000 files and rejects 10,001", () => {
    assert.deepEqual(checkFileCount(0, L), []);
    assert.deepEqual(checkFileCount(9999, L), []);
    assert.deepEqual(checkFileCount(10_000, L), []);
    assertExceeded(only(checkFileCount(10_001, L)), "maxFiles", 10_001, 10_000);
  });

  it("honours an overridden limit", () => {
    assert.deepEqual(checkFileCount(2, limitsWith({ maxFiles: 2 })), []);
    assertExceeded(only(checkFileCount(3, limitsWith({ maxFiles: 2 }))), "maxFiles", 3, 2);
  });

  it("throws a RangeError for a count that is not a non-negative integer", () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity]) {
      assert.throws(() => checkFileCount(bad, L), RangeError);
    }
  });
});

describe("checkPngSize (maxPngPixels, scale at most 4)", () => {
  it("accepts a scale of 4 and rejects a scale of 5 (T-AC-3)", () => {
    assert.equal(MAX_PNG_SCALE, 4);
    assert.deepEqual(checkPngSize({ width: 100, height: 100, scale: 4 }, L), []);
    const d = only(checkPngSize({ width: 100, height: 100, scale: 5 }, L));
    assertExceeded(d, "maxPngScale", 5, 4);
    assertExceeded(only(checkPngSize({ width: 1, height: 1, scale: 4.01 }, L)), "maxPngScale", 4.01, 4);
    assertExceeded(only(checkPngSize({ width: 1, height: 1, scale: Infinity }, L)), "maxPngScale", Infinity, 4);
  });

  it("accepts 40,000,000 pixels and rejects one more at scale 1 (T-AC-3)", () => {
    assert.deepEqual(checkPngSize({ width: 8000, height: 5000, scale: 1 }, L), []);
    assert.deepEqual(checkPngSize({ width: 7999, height: 5000, scale: 1 }, L), []);
    assertExceeded(only(checkPngSize({ width: 8000, height: 5001, scale: 1 }, L)), "maxPngPixels", 40_008_000, 40_000_000);
    const d = only(checkPngSize({ width: 7000, height: 6000, scale: 1 }, L));
    assertExceeded(d, "maxPngPixels", 42_000_000, 40_000_000);
    assert.ok(d.message.includes("7000x6000"));
  });

  it("squares the scale", () => {
    assert.deepEqual(checkPngSize({ width: 5000, height: 2000, scale: 2 }, L), []); // 40,000,000
    assertExceeded(only(checkPngSize({ width: 5000, height: 2001, scale: 2 }, L)), "maxPngPixels", 40_020_000, 40_000_000);
    assert.deepEqual(checkPngSize({ width: 2500, height: 1000, scale: 4 }, L), []); // 40,000,000
    assertExceeded(only(checkPngSize({ width: 2500, height: 1001, scale: 4 }, L)), "maxPngPixels", 40_040_000, 40_000_000);
    assert.deepEqual(checkPngSize({ width: 16000, height: 5000, scale: 0.5 }, L), []); // 20,000,000
  });

  it("reports a fractional pixel count rounded up", () => {
    const limits = limitsWith({ maxPngPixels: 10 });
    assert.deepEqual(checkPngSize({ width: 2, height: 5, scale: 1 }, limits), []);
    assertExceeded(only(checkPngSize({ width: 2.5, height: 4.2, scale: 1 }, limits)), "maxPngPixels", 11, 10);
  });

  it("returns both findings when both apply, sorted", () => {
    const found = checkPngSize({ width: 7000, height: 6000, scale: 5 }, L);
    assert.equal(found.length, 2);
    assert.deepEqual(found, sortDiagnostics(found));
    assert.ok(found.some((d) => d.message.startsWith("maxPngScale")));
    assert.ok(found.some((d) => d.message.startsWith("maxPngPixels")));
  });

  it("honours an overridden limit", () => {
    const limits = limitsWith({ maxPngPixels: 100 });
    assert.deepEqual(checkPngSize({ width: 10, height: 10, scale: 1 }, limits), []);
    assertExceeded(only(checkPngSize({ width: 10, height: 11, scale: 1 }, limits)), "maxPngPixels", 110, 100);
  });

  it("throws a RangeError for a size or scale that is not a positive number", () => {
    const bad = [
      { width: 0, height: 1, scale: 1 },
      { width: 1, height: -1, scale: 1 },
      { width: Number.NaN, height: 1, scale: 1 },
      { width: Infinity, height: 1, scale: 1 },
      { width: 1, height: 1, scale: 0 },
      { width: 1, height: 1, scale: -1 },
      { width: 1, height: 1, scale: Number.NaN },
    ];
    for (const size of bad) {
      assert.throws(() => checkPngSize(size, L), RangeError, JSON.stringify(size));
    }
  });
});
