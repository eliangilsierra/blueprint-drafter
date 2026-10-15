import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { repositoryRoot } from "../scaffold/helpers.js";
import { createTextEngine, loadBundledFonts, measure, wrap } from "../../src/core/text/index.js";
import type { FontWeight } from "../../src/core/text/index.js";
import { fakeProvider } from "./support/fake-font.js";
import { plainAdvance, readTableFont } from "./support/ttf.js";

const fontsDirectory = join(repositoryRoot, "fonts");
const tables = {
  regular: readTableFont(join(fontsDirectory, "IBMPlexSans-Regular.ttf")),
  semibold: readTableFont(join(fontsDirectory, "IBMPlexSans-SemiBold.ttf")),
} as const;

/** Width in px that the font tables give for a string without kerning or ligature, at a size. */
function expectedWidth(text: string, size: number, weight: FontWeight): number {
  const font = tables[weight];
  return (plainAdvance(font, text) * size) / font.unitsPerEm;
}

describe("measure with the bundled font (T-AC-3)", () => {
  // Strings in which the font has no kerning pair and no ligature: the hmtx advances alone give the width.
  const plain: ReadonlyArray<readonly [string, number, FontWeight]> = [
    ["0123456789", 14, "regular"],
    ["Blueprint 123", 14, "regular"],
    ["0123456789", 14, "semibold"],
    ["2024 1234 0987", 9, "semibold"],
    ["Blueprint 123", 21.5, "regular"],
    ["\u2026", 14, "regular"],
  ];
  for (const [text, size, weight] of plain) {
    it(`${JSON.stringify(text)} at ${String(size)} px ${weight} is the sum of the font table advances`, () => {
      const expected = expectedWidth(text, size, weight);
      assert.ok(expected > 0);
      assert.ok(Math.abs(measure(text, size, weight).width - expected) < 0.01, `${String(measure(text, size, weight).width)} vs ${String(expected)}`);
    });
  }

  it("applies the kerning of the font: AV is narrower than the sum of the table advances", () => {
    const kerned = measure("AV", 14, "regular").width;
    assert.ok(kerned < expectedWidth("AV", 14, "regular") - 0.01, String(kerned));
  });

  it("applies the ligatures of the font: fi is not the sum of the table advances of f and i", () => {
    assert.ok(Math.abs(measure("fi", 14, "regular").width - expectedWidth("fi", 14, "regular")) > 0.01);
  });

  it("scales linearly with the size", () => {
    const small = measure("Scaling check", 10, "regular").width;
    assert.ok(Math.abs(measure("Scaling check", 20, "regular").width - 2 * small) < 1e-9);
  });

  it("measures the semibold weight with its own file", () => {
    assert.ok(measure("Weight", 14, "semibold").width > measure("Weight", 14, "regular").width);
  });

  it("returns the ascent and descent of the font (hhea), positive, in px", () => {
    for (const weight of ["regular", "semibold"] as const) {
      const metrics = measure("x", 16, weight);
      assert.ok(Math.abs(metrics.ascent - (tables[weight].ascender * 16) / tables[weight].unitsPerEm) < 1e-9);
      assert.ok(Math.abs(metrics.descent - (-tables[weight].descender * 16) / tables[weight].unitsPerEm) < 1e-9);
      assert.ok(metrics.ascent > 0 && metrics.descent > 0);
    }
  });

  it("measures the empty string as zero width", () => {
    assert.equal(measure("", 14, "regular").width, 0);
  });

  it("gives code points without a glyph the width of the missing-glyph box, without throwing", () => {
    for (const text of ["日本語", "😀", "\ud800", "\u0000", "a\u200bb"]) {
      const { width } = measure(text, 14, "regular");
      assert.ok(Number.isFinite(width) && width >= 0, text);
    }
  });

  it("has a glyph for the ellipsis in both weights", () => {
    for (const weight of ["regular", "semibold"] as const) {
      assert.notEqual(tables[weight].glyphOf(0x2026), 0);
    }
    const provider = loadBundledFonts();
    assert.equal(provider.face("regular").hasGlyph(0x2026), true);
    assert.equal(provider.face("semibold").hasGlyph(0x2026), true);
    assert.equal(provider.face("regular").hasGlyph(0x65e5), false);
  });

  it("rejects a size that is not a positive finite number", () => {
    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => measure("x", size, "regular"), RangeError, String(size));
    }
  });

  it("rejects text longer than the bound instead of measuring it", () => {
    assert.throws(() => measure("x".repeat(1001), 14, "regular"), RangeError);
    assert.doesNotThrow(() => measure("x".repeat(1000), 14, "regular"));
  });
});

describe("determinism and cache (T-AC-2, NFR-1)", () => {
  const label = "Customer Self-Service Portal and Account Management Console AV fi 日本語 😀";

  it("measure returns identical results across 3 runs and across a cold and a warm cache", () => {
    const engine = createTextEngine(loadBundledFonts());
    const cold = engine.measure(label, 14, "regular");
    const results = [1, 2, 3].map(() => engine.measure(label, 14, "regular"));
    for (const result of results) {
      assert.deepEqual(result, cold);
    }
    engine.clearCache();
    assert.deepEqual(engine.measure(label, 14, "regular"), cold);
    const fresh = createTextEngine(loadBundledFonts());
    assert.deepEqual(fresh.measure(label, 14, "regular"), cold);
    assert.deepEqual(measure(label, 14, "regular"), cold);
  });

  it("wrap returns identical results across 3 runs and across a cold and a warm cache", () => {
    const engine = createTextEngine(loadBundledFonts());
    const cold = engine.wrap(label, 120, 14, "regular", 3);
    for (let run = 0; run < 3; run++) {
      assert.deepEqual(engine.wrap(label, 120, 14, "regular", 3), cold);
    }
    engine.clearCache();
    assert.deepEqual(engine.wrap(label, 120, 14, "regular", 3), cold);
    assert.deepEqual(createTextEngine(loadBundledFonts()).wrap(label, 120, 14, "regular", 3), cold);
    assert.deepEqual(wrap(label, 120, 14, "regular", 3), cold);
  });

  it("a cache of one entry (always overflowing) gives the same results as a large one", () => {
    // The cache empties itself when full; results must not depend on what it holds.
    const engine = createTextEngine(loadBundledFonts());
    const expected = engine.wrap(label, 120, 14, "semibold", 4);
    for (let i = 0; i < 20000; i++) {
      engine.measure(`filler ${String(i)}`, 14, "regular");
    }
    assert.deepEqual(engine.wrap(label, 120, 14, "semibold", 4), expected);
  });

  it("the cache avoids repeated layouts and never changes a width", () => {
    const provider = fakeProvider();
    const engine = createTextEngine(provider);
    const first = engine.measure("cached text", 10, "regular");
    const calls = provider.calls.count;
    assert.equal(engine.measure("cached text", 10, "regular").width, first.width);
    assert.equal(provider.calls.count, calls, "a warm call must not lay the string out again");
    engine.clearCache();
    engine.measure("cached text", 10, "regular");
    assert.equal(provider.calls.count, calls + 1, "clearCache forgets the entry");
  });
});
