// Reviewed third-party packages that src/core may import (issue #59, architecture section 9 B5, ADR-0005).
//
// This is data: eslint.config.core.js passes the names to the core-imports rule, and
// test/scaffold/core-dependencies.test.ts checks every entry against package.json, the lockfile and the
// installed code. To add a package, add one entry in the Pull Request that needs it, say so in the Pull Request
// description and fill every field; the security review looks at it. A new version of a listed package needs a
// new review (the test compares `version` with package.json and the installed package).
//
// Fields:
//   name, version  the package and the exact version that was reviewed (a runtime dependency in package.json)
//   task           the task that imports it from src/core ("#17"); an entry that no core file imports yet is
//                  planned by that task
//   reason         why the core needs it and what it is used for
//   licence        the licence and the ADR-0005 class it was checked against
//   reviewed       date of the review (YYYY-MM-DD)
//   review         what was reviewed and what was found (scan, install scripts, audit)
//   exceptions     findings of the static scan (a forbidden module named in the package or one of its production
//                  dependencies) that were read and accepted: package, file (relative to that package), modules,
//                  reason. Any other finding fails the test.

/**
 * @typedef {{ package: string, file: string, modules: string[], reason: string }} ScanException
 * @typedef {{ name: string, version: string, task: string, reason: string, licence: string,
 *             reviewed: string, review: string, exceptions: ScanException[] }} CorePackage
 */

/** @type {CorePackage[]} */
export const corePackages = [
  {
    name: "fontkit",
    version: "2.0.4",
    task: "#17",
    reason: "Text measurement in src/core/text: glyph advances, ascent and descent of the vendored IBM Plex Sans files.",
    licence: "MIT (permissive, allowed by ADR-0005); production dependencies MIT, Apache-2.0 (@swc/helpers) and 0BSD (tslib)",
    reviewed: "2026-10-14",
    review:
      "Static scan of fontkit and its 12 production dependencies (@swc/helpers, base64-js, brotli, clone, dfa, fast-deep-equal, pako, restructure, tiny-inflate, tslib, unicode-properties, unicode-trie): no forbidden module, no install script; npm audit: no advisory. brotli/build/encode.js (an Emscripten build of the encoder) calls eval; fontkit uses only the decoder, and the throwing stubs catch eval at run time.",
    exceptions: [],
  },
  {
    name: "elkjs",
    version: "0.12.0",
    task: "#20",
    reason: "ELK Layered layout in src/core/layout-elk (ADR-0002); run inside the layout worker of #21.",
    licence: "EPL-2.0 OR GPL-3.0-or-later; EPL-2.0 elected (weak copyleft, allowed unmodified by ADR-0005)",
    reviewed: "2026-10-14",
    review:
      "Static scan of the package (no production dependencies): no forbidden module, no install script; npm audit: no advisory. lib/main.js loads its own lib/elk-worker.min.js and, only when a workerUrl option is passed, the optional package web-worker (not installed).",
    exceptions: [],
  },
  {
    name: "@resvg/resvg-js",
    version: "2.6.2",
    task: "#30",
    reason: "PNG export in src/core/export/png.ts: rasterises the SVG with the same font files, no browser.",
    licence: "MPL-2.0 (weak copyleft, allowed unmodified by ADR-0005); the platform packages are MPL-2.0 too",
    reviewed: "2026-10-14",
    review:
      "Static scan of the package and the installed platform package (prebuilt native binary, not scannable): one finding, accepted below; no install script (the platform package is chosen by npm through optionalDependencies); npm audit: no advisory.",
    exceptions: [
      {
        package: "@resvg/resvg-js",
        file: "js-binding.js",
        modules: ["child_process"],
        reason:
          "isMusl() runs execSync('which ldd') only on Linux and only when process.report.getReport is missing, which every supported Node.js version (22 or later) provides; the throwing stubs would report the call if it ever ran.",
      },
    ],
  },
];
