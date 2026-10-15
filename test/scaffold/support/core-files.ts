// Source files of src/core as tsc sees them (issue #59): discovery for the guard of core-stubs.test.ts and the
// extension check of core-isolation.test.ts.

import { readdirSync } from "node:fs";
import { extname, join } from "node:path";

/** Every extension tsc compiles from src/core, and the extension of its output (allowJs is off). */
export const COMPILED_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  [".ts", ".js"],
  [".tsx", ".js"],
  [".mts", ".mjs"],
  [".cts", ".cjs"],
]);

const DECLARATION = /\.d\.[mc]?ts$/;

/** Every file under a directory, at any depth, sorted. */
export function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** True for a file that tsc compiles to JavaScript (not a declaration file). */
export function isCompiledSource(file: string): boolean {
  return COMPILED_EXTENSIONS.has(extname(file)) && !DECLARATION.test(file);
}

/** Source files under a directory that tsc compiles, discovered at run time. */
export function discoverSources(directory: string): string[] {
  return listFiles(directory).filter(isCompiledSource);
}

/** Path of the compiled output of a source file, relative to the same root. */
export function compiledName(source: string): string {
  const extension = extname(source);
  return source.slice(0, -extension.length) + (COMPILED_EXTENSIONS.get(extension) ?? extension);
}
