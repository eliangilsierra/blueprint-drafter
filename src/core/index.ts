/**
 * Public entry point of the blueprint-drafter core library (the only import path of the package).
 *
 * The core is pure and local: it never evaluates code, starts processes or opens network
 * connections (architecture section 7.9, NFR-2, NFR-8). ESLint enforces this for `src/core/**`.
 */

/** Version of the public TypeScript API. Changes only with a breaking change of the API. */
export const API_VERSION = 1;

/** Version of the diagram text format, written in the first line of every diagram file. */
export const FORMAT_VERSION = 1;
