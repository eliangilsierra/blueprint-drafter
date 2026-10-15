import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ELLIPSIS, MAX_TEXT_LENGTH, createTextEngine, elide, loadBundledFonts, measure } from "../../src/core/text/index.js";
import { fakeProvider } from "./support/fake-font.js";

// Fake font at size 10: a code point of the regular weight is 6 px wide, the ellipsis 9 px (see fake-font.ts).
const engine = createTextEngine(fakeProvider());
const elideFake = (text: string, maxWidth: number, weight: "regular" | "semibold" = "regular") =>
  engine.elide(text, maxWidth, 10, weight);

describe("elide", () => {
  it("returns text that fits unchanged and not truncated", () => {
    assert.deepEqual(elideFake("hello", 30), { text: "hello", width: 30, truncated: false });
    assert.deepEqual(elideFake("", 0), { text: "", width: 0, truncated: false });
  });

  it("cuts to the longest prefix that fits together with the ellipsis and flags the truncation", () => {
    // "abcdefghij" is 60 px. Prefix plus ellipsis: "abcd" + 9 = 33 px fits 35, "abcde" = 39 px does not.
    const result = elideFake("abcdefghij", 35);
    assert.deepEqual(result, { text: "abcd…", width: 33, truncated: true });
    assert.ok(result.width <= 35);
  });

  it("fits exactly: a width equal to the maximum is not truncated, one pixel less is", () => {
    assert.equal(elideFake("abcde", 30).truncated, false);
    assert.equal(elideFake("abcde", 29).truncated, true);
  });

  it("drops the space before the ellipsis", () => {
    assert.equal(elideFake("aa bb cc", 27).text, "aa…");
  });

  it("drops trailing white space kept by the length bound before the ellipsis", () => {
    assert.equal(elideFake("ab" + " ".repeat(MAX_TEXT_LENGTH * 2), 1_000_000).text, "ab…");
  });

  it("returns the ellipsis alone when nothing else fits with it, even if it is wider than the width", () => {
    assert.deepEqual(elideFake("abcdef", 8), { text: "…", width: 9, truncated: true });
    assert.deepEqual(elideFake("abcdef", 0), { text: "…", width: 9, truncated: true });
  });

  it("uses the width of the weight", () => {
    assert.equal(elideFake("abcdefghij", 35, "semibold").text, "abc…"); // 3 * 7 + 1.5 * 7 = 31.5; four need 38.5
  });

  it("cuts by code point: an emoji or a CJK character is never split", () => {
    const result = elideFake("😀😀😀😀😀😀", 28); // 3 emoji + ellipsis = 27 px
    assert.equal(result.text, "😀😀😀…");
    assert.doesNotMatch(result.text, /[\ud800-\udbff](?![\udc00-\udfff])/);
    assert.equal(elideFake("日本語日本語", 28).text, "日本語…");
  });

  it("returns the longest prefix: one more character would not fit", () => {
    for (let width = 9; width < 70; width += 3) {
      const result = elideFake("abcdefghijklmnop", width);
      assert.ok(result.width <= width);
      const kept = Array.from(result.text).length - 1;
      assert.ok((kept + 1) * 6 + 9 > width, `${String(width)}: a longer prefix would fit`);
    }
  });

  it("cuts input longer than the bound and flags it even if the kept part fits", () => {
    const result = elideFake("a".repeat(MAX_TEXT_LENGTH + 1), 1_000_000);
    assert.equal(result.truncated, true);
    assert.ok(result.text.endsWith(ELLIPSIS));
    assert.equal(elideFake("a".repeat(MAX_TEXT_LENGTH), 1_000_000).truncated, false);
  });

  it("rejects a bad size or width", () => {
    for (const width of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => elideFake("a", width), RangeError, String(width));
    }
    for (const size of [0, -1, Number.NaN]) {
      assert.throws(() => engine.elide("a", 10, size, "regular"), RangeError, String(size));
    }
  });

  it("is a pure function of its input", () => {
    const first = elideFake("abcdefghij", 35);
    assert.deepEqual(elideFake("abcdefghij", 35), first);
    assert.deepEqual(createTextEngine(fakeProvider()).elide("abcdefghij", 35, 10, "regular"), first);
  });
});

describe("elide with the bundled font", () => {
  it("shortens a long name to the width and reports the real width of the result", () => {
    const name = "Customer Self-Service Portal and Account Management Console";
    const result = elide(name, 150, 14, "semibold");
    assert.equal(result.truncated, true);
    assert.ok(result.text.endsWith(ELLIPSIS));
    assert.ok(result.width <= 150);
    assert.equal(result.width, measure(result.text, 14, "semibold").width);
    assert.ok(name.startsWith(result.text.slice(0, -1)));
    // Longest prefix: the next character does not fit.
    const next = name.slice(0, result.text.length) + ELLIPSIS;
    assert.ok(measure(next, 14, "semibold").width > 150);
  });

  it("leaves a short name alone", () => {
    assert.deepEqual(elide("Billing", 150, 14, "regular"), {
      text: "Billing",
      width: measure("Billing", 14, "regular").width,
      truncated: false,
    });
  });

  it("is identical for a cold and a warm cache", () => {
    const fresh = createTextEngine(loadBundledFonts());
    const cold = fresh.elide("Third-Party Customer Relationship Management Platform", 120, 14, "regular");
    assert.deepEqual(fresh.elide("Third-Party Customer Relationship Management Platform", 120, 14, "regular"), cold);
    fresh.clearCache();
    assert.deepEqual(fresh.elide("Third-Party Customer Relationship Management Platform", 120, 14, "regular"), cold);
  });
});
