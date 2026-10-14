import assert from "node:assert/strict";
import { test } from "node:test";

import * as core from "../../src/core/index.js";

test("the core exposes API version 1 and format version 1", () => {
  assert.equal(core.API_VERSION, 1);
  assert.equal(core.FORMAT_VERSION, 1);
});

test("the core exports nothing else yet", () => {
  assert.deepEqual(Object.keys(core).sort(), ["API_VERSION", "FORMAT_VERSION"]);
});
