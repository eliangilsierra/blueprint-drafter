#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "blueprint-drafter";

const USAGE = `Usage: ${PACKAGE_NAME} [options]

Semantic diagram engine for AI coding agents.

Options:
  --version  Print the version and exit
  --help     Print this usage text and exit
`;

interface CliResult {
  readonly exitCode: 0 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Reads the version from the package.json that sits above this file, in dist/ or in dist-test/. */
function readPackageVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const manifest: unknown = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      if (isRecord(manifest) && manifest["name"] === PACKAGE_NAME && typeof manifest["version"] === "string") {
        return manifest["version"];
      }
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`package.json of ${PACKAGE_NAME} not found`);
    }
    directory = parent;
  }
}

/** Exit codes follow the architecture (section 7.5): 0 success, 2 could not evaluate (usage error). */
function run(args: readonly string[]): CliResult {
  if (args.includes("--help")) {
    return { exitCode: 0, stdout: USAGE, stderr: "" };
  }
  if (args.includes("--version")) {
    return { exitCode: 0, stdout: `${readPackageVersion()}\n`, stderr: "" };
  }
  const reason = args.length === 0 ? "no command given" : `unknown argument: ${args.join(" ")}`;
  return { exitCode: 2, stdout: "", stderr: `${PACKAGE_NAME}: ${reason}\n\n${USAGE}` };
}

const result = run(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
