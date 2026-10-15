/**
 * The `limits` module: the configurable input limits and the checks that enforce them before tokenizing, before
 * allocation and before layout (architecture sections 6.1 and 9, NFR-9). Depends on `model` only. The public
 * re-export from `src/core/index.ts` is a separate task.
 */

export * from "./checks.js";
export * from "./merge.js";
export * from "./table.js";
