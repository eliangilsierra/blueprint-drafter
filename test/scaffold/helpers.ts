import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findRepositoryRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const manifest: unknown = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      if (isRecord(manifest) && manifest["name"] === "blueprint-drafter") {
        return directory;
      }
    } catch {
      // No readable package.json in this directory: keep walking up.
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error("repository root not found");
    }
    directory = parent;
  }
}

/** Absolute path of the repository root (the directory of the blueprint-drafter package.json). */
export const repositoryRoot = findRepositoryRoot();

export function readText(...segments: string[]): string {
  return readFileSync(join(repositoryRoot, ...segments), "utf8");
}

export function readJson(...segments: string[]): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readText(...segments));
  if (!isRecord(parsed)) {
    throw new Error(`${segments.join("/")} is not a JSON object`);
  }
  return parsed;
}
