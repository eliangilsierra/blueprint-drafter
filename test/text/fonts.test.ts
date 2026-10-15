import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { repositoryRoot } from "../scaffold/helpers.js";
import {
  CHECKSUM_FILE,
  FONT_FILES,
  FONT_WEIGHTS,
  FontLoadError,
  findBundledFontsDirectory,
  loadBundledFonts,
  parseChecksums,
} from "../../src/core/text/fonts.js";

const realFonts = join(repositoryRoot, "fonts");
const scratch = mkdtempSync(join(tmpdir(), "blueprint-drafter-fonts-"));
after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let copies = 0;
/** A temporary directory with copies of both fonts and the checksum list, ready to be corrupted. */
function fixture(): string {
  copies += 1;
  const directory = join(scratch, `copy-${String(copies)}`);
  mkdirSync(directory);
  for (const name of [...Object.values(FONT_FILES), CHECKSUM_FILE]) {
    copyFileSync(join(realFonts, name), join(directory, name));
  }
  return directory;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function flipByte(file: string, offset: number): void {
  const bytes = readFileSync(file);
  bytes[offset] = (bytes[offset] ?? 0) ^ 0x01;
  writeFileSync(file, bytes);
}

function assertInternal(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof FontLoadError, "a FontLoadError is thrown");
    assert.ok(error instanceof Error);
    assert.equal(error.code, "E_INTERNAL");
    assert.match(error.message, pattern);
    return true;
  });
}

describe("loading the bundled fonts", () => {
  it("finds the vendored fonts/ directory of the package and loads both weights", () => {
    assert.equal(findBundledFontsDirectory(), realFonts);
    const provider = loadBundledFonts();
    for (const weight of FONT_WEIGHTS) {
      const face = provider.face(weight);
      assert.equal(face.unitsPerEm, 1000);
      assert.ok(face.ascent > 0 && face.descent > 0);
      assert.ok(face.advance("Plex") > 0);
      assert.equal(face.advance(""), 0);
    }
  });

  it("checks the repository SHA256SUMS against the files independently of the loader", () => {
    const sums = parseChecksums(readFileSync(join(realFonts, CHECKSUM_FILE), "utf8"));
    assert.deepEqual([...sums.keys()].sort(), Object.values(FONT_FILES).sort());
    for (const [name, digest] of sums) {
      assert.equal(sha256(readFileSync(join(realFonts, name))), digest, name);
    }
  });

  it("loads a clean copy from another directory", () => {
    assert.doesNotThrow(() => loadBundledFonts({ directory: fixture() }));
  });

  it("does not write or create anything in the font directory", () => {
    const directory = fixture();
    const before = readdirSync(directory).sort();
    const bytes = readFileSync(join(directory, FONT_FILES.regular));
    loadBundledFonts({ directory });
    assert.deepEqual(readdirSync(directory).sort(), before);
    assert.deepEqual(readFileSync(join(directory, FONT_FILES.regular)), bytes);
  });

  it("rejects an unknown weight", () => {
    const provider = loadBundledFonts();
    // @ts-expect-error a weight outside the union is a type error; the provider still refuses it at run time
    assert.throws(() => provider.face("bold"), RangeError);
  });
});

describe("integrity check (T-AC-1)", () => {
  for (const weight of FONT_WEIGHTS) {
    it(`a changed byte in the ${weight} file fails with E_INTERNAL and names the file`, () => {
      const directory = fixture();
      flipByte(join(directory, FONT_FILES[weight]), 1000);
      assertInternal(() => loadBundledFonts({ directory }), new RegExp(`${FONT_FILES[weight]} does not match its SHA-256`));
    });
  }

  it("a changed first byte, a changed last byte and a missing last byte are all detected", () => {
    for (const change of ["first", "last", "truncate"] as const) {
      const directory = fixture();
      const file = join(directory, FONT_FILES.regular);
      const bytes = readFileSync(file);
      if (change === "first") {
        flipByte(file, 0);
      } else if (change === "last") {
        flipByte(file, bytes.length - 1);
      } else {
        writeFileSync(file, bytes.subarray(0, bytes.length - 1));
      }
      assertInternal(() => loadBundledFonts({ directory }), /does not match its SHA-256/);
    }
  });

  it("uses no fallback: a corrupted file never yields a provider, so nothing can be measured", () => {
    const directory = fixture();
    flipByte(join(directory, FONT_FILES.semibold), 5000);
    let provider: unknown;
    assert.throws(() => {
      provider = loadBundledFonts({ directory });
    }, FontLoadError);
    assert.equal(provider, undefined);
  });

  it("a missing font file fails with E_INTERNAL and keeps the cause", () => {
    const directory = fixture();
    rmSync(join(directory, FONT_FILES.regular));
    assert.throws(
      () => loadBundledFonts({ directory }),
      (error: unknown) => {
        assert.ok(error instanceof FontLoadError);
        assert.equal(error.code, "E_INTERNAL");
        assert.match(error.message, /IBMPlexSans-Regular\.ttf cannot be read/);
        assert.ok(error.cause instanceof Error);
        return true;
      },
    );
  });

  it("a missing checksum list, or a list without one of the files, fails with E_INTERNAL", () => {
    const missing = fixture();
    rmSync(join(missing, CHECKSUM_FILE));
    assertInternal(() => loadBundledFonts({ directory: missing }), /SHA256SUMS cannot be read/);

    const partial = fixture();
    const kept = readFileSync(join(partial, CHECKSUM_FILE), "utf8")
      .split("\n")
      .filter((line) => !line.endsWith(FONT_FILES.semibold));
    writeFileSync(join(partial, CHECKSUM_FILE), kept.join("\n"));
    assertInternal(() => loadBundledFonts({ directory: partial }), /does not list IBMPlexSans-SemiBold\.ttf/);
  });

  it("a directory that does not exist fails with E_INTERNAL", () => {
    assertInternal(() => loadBundledFonts({ directory: join(scratch, "does-not-exist") }), /SHA256SUMS cannot be read/);
  });

  it("a file with the right checksum that is not a font fails with E_INTERNAL", () => {
    const directory = fixture();
    const garbage = Buffer.from("this is not a font file, only text with a valid checksum".repeat(10));
    writeFileSync(join(directory, FONT_FILES.regular), garbage);
    const list = readFileSync(join(directory, CHECKSUM_FILE), "utf8").replace(
      /^[0-9a-f]{64}( {2}IBMPlexSans-Regular\.ttf)$/m,
      (_, rest: string) => `${sha256(garbage)}${rest}`,
    );
    writeFileSync(join(directory, CHECKSUM_FILE), list);
    assertInternal(() => loadBundledFonts({ directory }), /cannot be parsed as a font/);
  });

  it("a file larger than the bound is refused before it is read or hashed", () => {
    const directory = fixture();
    writeFileSync(join(directory, FONT_FILES.regular), Buffer.alloc(4 * 1024 * 1024 + 1));
    assertInternal(() => loadBundledFonts({ directory }), /larger than 4194304 bytes/);
  });
});

describe("parseChecksums", () => {
  const digest = "a".repeat(64);

  it("reads the sha256sum format in text and binary mode, with LF or CRLF, ignoring blank lines", () => {
    const sums = parseChecksums(`${digest}  one.ttf\r\n\n${"b".repeat(64)} *two.ttf\n`);
    assert.deepEqual(
      [...sums],
      [
        ["one.ttf", digest],
        ["two.ttf", "b".repeat(64)],
      ],
    );
  });

  const bad: ReadonlyArray<readonly [string, string]> = [
    ["a short digest", `${"a".repeat(63)}  one.ttf`],
    ["an uppercase digest", `${"A".repeat(64)}  one.ttf`],
    ["a non-hex digest", `${"g".repeat(64)}  one.ttf`],
    ["a single space separator", `${digest} one.ttf`],
    ["no file name", `${digest}  `],
    ["text without a digest", "one.ttf"],
  ];
  for (const [name, line] of bad) {
    it(`rejects ${name}`, () => {
      assertInternal(() => parseChecksums(line), /not in sha256sum format/);
    });
  }

  it("rejects a name listed twice", () => {
    assertInternal(() => parseChecksums(`${digest}  one.ttf\n${digest}  one.ttf\n`), /lists one\.ttf twice/);
  });
});
