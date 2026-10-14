/**
 * The `model` module: data types, closed enumerations and the small deterministic helpers every other core
 * module shares. It depends on nothing. The public re-export from `src/core/index.ts` is a separate task.
 */

export * from "./diagnostics.js";
export * from "./enums.js";
export type * from "./types.js";
export * from "./util.js";
