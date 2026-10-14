import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import { coreIsolation } from "./eslint.config.core.js";

export default defineConfig(
  {
    name: "blueprint-drafter/ignores",
    // docs/research/** is an archived prototype that no tsconfig includes: type-aware linting cannot parse it.
    ignores: ["dist/**", "dist-test/**", "coverage/**", "node_modules/**", "docs/research/**"],
  },
  {
    name: "blueprint-drafter/typescript",
    files: ["**/*.{ts,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // node:test registers tests synchronously; the runner awaits them, so the returned promise is safe to drop.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["test", "it", "describe", "suite"] },
          ],
        },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  ...coreIsolation,
);
