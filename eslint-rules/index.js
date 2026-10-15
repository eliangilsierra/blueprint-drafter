// Local ESLint plugin of the repository (issue #59): the isolation rules of src/core. Configured in
// eslint.config.core.js; tested through the real eslint.config.js in test/scaffold/core-isolation.test.ts.

import coreGlobals from "./core-globals.js";
import coreImports from "./core-imports.js";

export default {
  meta: { name: "blueprint-drafter" },
  rules: {
    "core-globals": coreGlobals,
    "core-imports": coreImports,
  },
};
