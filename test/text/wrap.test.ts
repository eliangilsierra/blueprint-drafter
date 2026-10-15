import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readText } from "../scaffold/helpers.js";
import { MAX_DESCRIPTION_LINES, MAX_NAME_LINES, MAX_TEXT_LENGTH, createTextEngine, loadBundledFonts } from "../../src/core/text/index.js";
import type { WrapResult } from "../../src/core/text/index.js";
import { fakeProvider } from "./support/fake-font.js";

// With the fake font at size 10, a code point of the regular weight is 6 px wide, one of the semibold weight 7 px,
// and the ellipsis 9 px (regular), so every expectation below is computed by hand.
const fake = fakeProvider();
const engine = createTextEngine(fake);
const wrap = (text: string, maxWidth: number, maxLines = 10, weight: "regular" | "semibold" = "regular", size = 10): WrapResult =>
  engine.wrap(text, maxWidth, size, weight, maxLines);

describe("wrap: spaces", () => {
  it("keeps text that fits on one line", () => {
    assert.deepEqual(wrap("hello world", 100), { lines: ["hello world"], widths: [66], truncated: false, overflow: false });
  });

  it("breaks greedily between words and fills a line up to the maximum width, inclusive", () => {
    assert.deepEqual(wrap("aaa bbb ccc", 42).lines, ["aaa bbb", "ccc"]); // "aaa bbb" is exactly 42 px
    assert.deepEqual(wrap("aaa bbb ccc", 41).lines, ["aaa", "bbb", "ccc"]);
    assert.deepEqual(wrap("aaa bbb ccc", 78).lines, ["aaa bbb ccc"]); // 11 characters, 66 px
  });

  it("collapses runs of white space and drops leading and trailing white space", () => {
    assert.deepEqual(wrap("  aaa \t\n  bbb\r\n\f\v", 100).lines, ["aaa bbb"]);
  });

  it("does not break at a no-break space or an ideographic space", () => {
    assert.deepEqual(wrap("aaa bbb", 30).lines, ["aaa b", "bb"]);
    assert.deepEqual(wrap("aaa　bbb", 100).lines, ["aaa　bbb"]);
  });

  it("returns no lines for the empty string and for blank text", () => {
    for (const text of ["", " ", " \t\n "]) {
      assert.deepEqual(wrap(text, 100), { lines: [], widths: [], truncated: false, overflow: false });
    }
  });

  it("uses the width of the weight and the size", () => {
    assert.deepEqual(wrap("aaaa", 20, 10, "regular").lines, ["aaa", "a"]); // 6 px each
    assert.deepEqual(wrap("aaaa", 20, 10, "semibold").lines, ["aa", "aa"]); // 7 px each
    assert.deepEqual(wrap("aaaa", 20, 10, "regular", 20).lines, ["a", "a", "a", "a"]); // 12 px each
    assert.deepEqual(wrap("aaaa", 10, 10, "semibold", 5).widths, [7, 7]);
  });
});

describe("wrap: words longer than the line", () => {
  it("splits on character boundaries", () => {
    assert.deepEqual(wrap("abcdefghij", 30).lines, ["abcde", "fghij"]);
    assert.deepEqual(wrap("abcdefghijk", 30).lines, ["abcde", "fghij", "k"]);
  });

  it("starts a new line for the long word and splits it from there", () => {
    assert.deepEqual(wrap("xx abcdefghijkl", 30).lines, ["xx", "abcde", "fghij", "kl"]);
  });

  it("splits by code point and never inside a surrogate pair (CJK and emoji)", () => {
    assert.deepEqual(wrap("日本語日本語", 18).lines, ["日本語", "日本語"]);
    assert.deepEqual(wrap("😀😀😀😀😀", 12).lines, ["😀😀", "😀😀", "😀"]);
    for (const line of wrap("a😀b😀c😀d😀e", 12).lines) {
      assert.equal(line, Array.from(line).join(""));
      assert.doesNotMatch(line, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    }
  });

  it("puts a code point wider than the line on a line of its own and reports the overflow", () => {
    const result = wrap("abc", 5);
    assert.deepEqual(result.lines, ["a", "b", "c"]);
    assert.equal(result.overflow, true);
    assert.deepEqual(wrap("ab cd", 0).lines, ["a", "b", "c", "d"]);
    assert.equal(wrap("ab cd", 0).overflow, true);
  });

  it("does not report an overflow when every line fits", () => {
    assert.equal(wrap("abcdefghij", 30).overflow, false);
  });
});

describe("wrap: elision (AC-9)", () => {
  it("ends the last line with an ellipsis and flags the truncation", () => {
    const result = wrap("aaa bbb ccc ddd eee", 30, 3);
    assert.deepEqual(result.lines, ["aaa", "bbb", "ccc…"]);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.widths, [18, 18, 27]);
  });

  it("is not truncated when the text fills exactly the lines allowed", () => {
    const exact = wrap("aaa bbb ccc ddd eee", 30, 5);
    assert.equal(exact.lines.length, 5);
    assert.equal(exact.truncated, false);
    assert.equal(exact.lines.some((line) => line.includes("…")), false);
    const one = wrap("aaa bbb ccc ddd eee", 30, 4);
    assert.deepEqual(one.lines.at(-1), "ddd…");
    assert.equal(one.truncated, true);
  });

  it("shortens the last line until the line and the ellipsis fit the width", () => {
    // "bbbbb" is 30 px, the ellipsis 9 px: only "bbb" (18 px) plus the ellipsis (27 px) fits in 30 px.
    const result = wrap("aaaaa bbbbb ccccc", 30, 2);
    assert.deepEqual(result.lines, ["aaaaa", "bbb…"]);
    assert.equal(result.truncated, true);
    assert.equal(result.overflow, false);
  });

  it("never leaves a space before the ellipsis", () => {
    // "ab cd" fills the 30 px line; with the ellipsis only "ab " fits, and the space is dropped.
    assert.deepEqual(wrap("ab cd ef", 30, 1).lines, ["ab\u2026"]);
  });

  it("uses the ellipsis alone, and reports the overflow, when not even one character fits with it", () => {
    const result = wrap("abcdef", 8, 1);
    assert.deepEqual(result.lines, ["…"]);
    assert.equal(result.truncated, true);
    assert.equal(result.overflow, true);
  });

  it("limits names to 3 lines and descriptions to 4 (FR-7)", () => {
    assert.equal(MAX_NAME_LINES, 3);
    assert.equal(MAX_DESCRIPTION_LINES, 4);
    const text = "aaa bbb ccc ddd eee fff ggg";
    assert.equal(wrap(text, 30, MAX_NAME_LINES).lines.length, 3);
    assert.equal(wrap(text, 30, MAX_DESCRIPTION_LINES).lines.length, 4);
  });

  it("flags the truncation of text longer than the bound even when the kept text fits", () => {
    const result = wrap("a".repeat(MAX_TEXT_LENGTH + 500), 1_000_000, 3);
    assert.equal(result.truncated, true);
    assert.equal(result.lines.length, 1);
    assert.ok(result.lines[0]?.endsWith("…"));
    assert.equal(wrap("a".repeat(MAX_TEXT_LENGTH), 1_000_000, 3).truncated, false);
  });

  it("cuts long input at a code point boundary", () => {
    const result = wrap("a".repeat(MAX_TEXT_LENGTH - 1) + "😀 tail", 1_000_000, 3);
    assert.equal(result.truncated, true);
    assert.doesNotMatch(result.lines.join(""), /[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("has no truncation to report for a blank text of any length", () => {
    assert.deepEqual(wrap(" ".repeat(MAX_TEXT_LENGTH * 3), 100), { lines: [], widths: [], truncated: false, overflow: false });
  });
});

describe("wrap: arguments and bounded work", () => {
  it("rejects a line count that is not an integer of 1 or more", () => {
    for (const lines of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => wrap("a", 10, lines), RangeError, String(lines));
    }
  });

  it("rejects a width that is negative or not finite, and a size that is not positive and finite", () => {
    for (const width of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => wrap("a", width), RangeError, String(width));
    }
    for (const size of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => wrap("a", 10, 3, "regular", size), RangeError, String(size));
    }
  });

  it("handles lone surrogates and control characters without throwing", () => {
    const result = wrap("a\ud800b \u0000 c\udc00", 100);
    assert.equal(result.lines.length, 1);
  });

  it("does the work of a few lines for hostile input, however long", () => {
    const hostile: ReadonlyArray<readonly [string, string]> = [
      ["one word", "a".repeat(100_000)],
      ["many words", "a ".repeat(50_000)],
      ["white space", " ".repeat(100_000) + "x"],
      ["alternating", "a\t".repeat(50_000)],
    ];
    for (const [name, text] of hostile) {
      const counting = fakeProvider();
      const started = Date.now();
      const result = createTextEngine(counting).wrap(text, 60, 10, "regular", 3);
      assert.ok(counting.calls.count < 2000, `${name}: ${String(counting.calls.count)} layouts`);
      assert.ok(Date.now() - started < 2000, `${name} took too long`);
      assert.ok(result.lines.length <= 3);
    }
  });
});

describe("wrap: properties over generated text", () => {
  // A deterministic generator (no random source): a linear congruential sequence picks the pieces.
  function generate(seed: number): string {
    const pieces = ["a", "bb", "ccc", " ", "  ", "dddddddddddd", "日", "😀", "\t", "e f", "ggggggggggggggggggggggggg"];
    let state = seed;
    let text = "";
    for (let i = 0; i < 40; i++) {
      state = (state * 1103515245 + 12345) % 2147483648;
      text += pieces[state % pieces.length] ?? "";
    }
    return text;
  }

  it("keeps every line within the width, joins back to the normalised text and measures what it returns", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const text = generate(seed);
      const normalised = text.split(/[ \t\n\v\f\r]+/).filter((word) => word !== "").join(" ");
      for (const width of [12, 30, 55, 90, 400]) {
        for (const weight of ["regular", "semibold"] as const) {
          const result = wrap(text, width, 2000, weight);
          assert.equal(result.truncated, false);
          assert.equal(result.overflow, false, `${String(seed)}/${String(width)}`);
          assert.equal(result.lines.length, result.widths.length);
          for (const [index, line] of result.lines.entries()) {
            assert.ok((result.widths[index] ?? Infinity) <= width, `${line} is wider than ${String(width)}`);
            assert.equal(result.widths[index], engine.measure(line, 10, weight).width);
          }
          // Lines break at a space or inside a word, so the characters other than spaces are all kept, in order.
          assert.equal(result.lines.join("").replaceAll(" ", ""), normalised.replaceAll(" ", ""));
        }
      }
    }
  });

  it("is truncated exactly when the text needs more lines than allowed", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const text = generate(seed);
      const all = wrap(text, 55, 1000);
      for (const maxLines of [1, 2, 3, 4]) {
        const limited = wrap(text, 55, maxLines);
        assert.equal(limited.truncated, all.lines.length > maxLines, `${String(seed)}/${String(maxLines)}`);
        assert.ok(limited.lines.length <= maxLines);
        if (!limited.truncated) {
          assert.deepEqual(limited.lines, all.lines);
        } else {
          assert.deepEqual(limited.lines.slice(0, -1), all.lines.slice(0, limited.lines.length - 1));
          assert.ok(limited.lines.at(-1)?.endsWith("…"));
        }
      }
    }
  });
});

describe("wrap with the bundled font (AC-8, AC-9)", () => {
  const real = createTextEngine(loadBundledFonts());
  const corpus = readText("bench", "cases", "06-long-labels.bpd");
  const labels = [...corpus.matchAll(/"([^"\n]*)"/g)].map((match) => match[1] ?? "");
  const longLabels = labels.filter((label) => label.length >= 50);

  it("the benchmark case 6 has labels of 50 or more characters", () => {
    assert.ok(longLabels.length >= 4, `${String(longLabels.length)} long labels`);
    assert.ok(longLabels.some((label) => label.startsWith("Customer Self-Service Portal")));
  });

  it("wraps a label of 50 or more characters into several lines, none wider than the maximum width (AC-8)", () => {
    for (const label of longLabels) {
      for (const [size, weight, maxWidth] of [
        [14, "semibold", 120],
        [14, "regular", 160],
        [12, "regular", 200],
        [16, "semibold", 100],
      ] as const) {
        const natural = real.measure(label, size, weight).width;
        const result = real.wrap(label, maxWidth, size, weight, 20);
        assert.ok(natural > maxWidth, "the label does not fit on one line at this width");
        assert.ok(result.lines.length > 1, label);
        assert.equal(result.truncated, false);
        assert.equal(result.overflow, false);
        for (const line of result.lines) {
          assert.ok(real.measure(line, size, weight).width <= maxWidth, `${line} is wider than ${String(maxWidth)}`);
        }
        assert.equal(result.lines.join("").replaceAll(" ", ""), label.replaceAll(" ", ""), "no character is lost");
      }
    }
  });

  it("ends the last line with an ellipsis and flags truncation when the label cannot fit (AC-9)", () => {
    const label = longLabels.find((candidate) => candidate.startsWith("Lets customers manage subscriptions")) ?? "";
    assert.ok(label.length > 50);
    const full = real.wrap(label, 90, 12, "regular", 20);
    assert.ok(full.lines.length > MAX_DESCRIPTION_LINES, "the label needs more than 4 lines at 90 px");
    const result = real.wrap(label, 90, 12, "regular", MAX_DESCRIPTION_LINES);
    assert.equal(result.truncated, true);
    assert.equal(result.lines.length, MAX_DESCRIPTION_LINES);
    assert.ok(result.lines.at(-1)?.endsWith("…"));
    assert.deepEqual(result.lines.slice(0, -1), full.lines.slice(0, MAX_DESCRIPTION_LINES - 1));
    for (const line of result.lines) {
      assert.ok(real.measure(line, 12, "regular").width <= 90);
    }
    const wide = real.wrap(label, 90, 12, "regular", full.lines.length);
    assert.equal(wide.truncated, false);
  });

  it("measures the whole line, so the width of a line is not the sum of its words", () => {
    const result = real.wrap("AV AV AV", 1000, 14, "regular", 1);
    const sumOfWords = 3 * real.measure("AV", 14, "regular").width + 2 * real.measure(" ", 14, "regular").width;
    assert.ok(Math.abs((result.widths[0] ?? 0) - real.measure("AV AV AV", 14, "regular").width) < 1e-9);
    assert.ok(Math.abs((result.widths[0] ?? 0) - sumOfWords) < 1e-6, "no kerning across the space in this font");
  });
});
