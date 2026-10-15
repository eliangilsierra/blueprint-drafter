// Local ESLint rule: the import allow-list of src/core (issue #59, architecture section 7.9, NFR-2, NFR-8).
//
// Every way of naming a module is checked against one allow-list: static imports (also `import type`),
// `export ... from`, `import x = require()`, `import()` and `require()`. A specifier is allowed only when it is
//   - relative ("./", "../") and resolves inside the core directory, with the URL rules Node.js applies
//     ("%2e%2e" is "..", a backslash is a slash), so no depth or encoding leaves src/core;
//   - a Node.js built-in written as "node:<name>" that is in the `nodeModules` option (exact match);
//   - a package in the `packages` option, or a plain subpath of it with no ".", "..", encoded or "node_modules"
//     segment (a package without an "exports" map resolves "pkg/../other" to another package).
// Anything else is reported: other packages, built-ins without the "node:" prefix, absolute paths, URLs such
// as "data:" and "file:", and specifiers that are not a string literal, because they cannot be checked.
// The rule is lexical; the throwing-stub tests in test/scaffold/ are the second layer.

import { relative, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RELATIVE = /^\.{1,2}(?:\/|$)/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/**
 * Split a bare specifier into the package name and the subpath segments.
 * @param {string} specifier
 * @returns {{ name: string, subpath: string[] }}
 */
function splitBare(specifier) {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  return { name: parts.slice(0, nameLength).join("/"), subpath: parts.slice(nameLength) };
}

/**
 * @param {string} specifier
 * @param {string} filename absolute path of the linted file
 * @param {string} coreDirectory absolute path of src/core
 * @returns {boolean}
 */
function resolvesInsideCore(specifier, filename, coreDirectory) {
  let target;
  try {
    target = fileURLToPath(new URL(specifier, pathToFileURL(filename)));
  } catch {
    return false; // for example an encoded slash, which fileURLToPath refuses
  }
  const rest = relative(coreDirectory, target);
  return rest === "" || (!isAbsolute(rest) && rest !== ".." && !rest.startsWith(`..${sep}`));
}

/**
 * @param {import("estree").Node | null | undefined} node
 * @returns {string | undefined} the specifier when it is a string literal or a template literal without expressions
 */
function literalValue(node) {
  if (!node) {
    return undefined;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Allow src/core to import only core files, listed Node.js built-ins and reviewed packages" },
    schema: [
      {
        type: "object",
        properties: {
          coreDirectory: { type: "string" },
          nodeModules: { type: "array", items: { type: "string" }, uniqueItems: true },
          packages: { type: "array", items: { type: "string" }, uniqueItems: true },
        },
        required: ["coreDirectory", "nodeModules", "packages"],
        additionalProperties: false,
      },
    ],
    messages: {
      outsideCore:
        '"{{specifier}}" resolves outside src/core. The core may import only its own files; move the code or call it from an adapter.',
      nodeModule:
        '"{{specifier}}" is not on the Node.js allow-list for this file. Allowed here: {{allowed}}. A new grant needs its own block in eslint.config.core.js and a security review.',
      package:
        '"{{specifier}}" is not a reviewed core package. Add an entry to eslint-rules/core-allowlist.js in your Pull Request and say so in its description.',
      notChecked:
        "src/core must load modules by a plain string literal so that the allow-list can check it. Use an adapter instead.",
    },
  },

  create(context) {
    const [options] = context.options;
    const coreDirectory = options.coreDirectory;
    const nodeModules = new Set(options.nodeModules);
    const packages = new Set(options.packages);
    const filename = context.filename;

    /**
     * @param {import("estree").Node} node
     * @param {import("estree").Node | null | undefined} source
     */
    function check(node, source) {
      const specifier = literalValue(source);
      if (specifier === undefined) {
        context.report({ node, messageId: "notChecked" });
        return;
      }
      if (RELATIVE.test(specifier)) {
        if (!resolvesInsideCore(specifier, filename, coreDirectory)) {
          context.report({ node, messageId: "outsideCore", data: { specifier } });
        }
        return;
      }
      if (specifier.startsWith("node:")) {
        if (!nodeModules.has(specifier)) {
          context.report({ node, messageId: "nodeModule", data: { specifier, allowed: [...nodeModules].sort().join(", ") } });
        }
        return;
      }
      if (!URL_SCHEME.test(specifier)) {
        const { name, subpath } = splitBare(specifier);
        // A nested node_modules segment would reach a package that is not on the list (SR-6 of PR #61).
        const plainSubpath = subpath.every(
          (segment) => segment !== "node_modules" && /^[A-Za-z0-9_@+~-][A-Za-z0-9._@+~-]*$/.test(segment),
        );
        if (PACKAGE_NAME.test(name) && packages.has(name) && plainSubpath) {
          return;
        }
      }
      context.report({ node, messageId: "package", data: { specifier } });
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          check(node, node.source);
        }
      },
      ImportExpression(node) {
        check(node, node.source);
      },
      /** @param {any} node TSImportEqualsDeclaration (typescript-eslint) */
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === "TSExternalModuleReference") {
          check(node, node.moduleReference.expression);
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node, /** @type {import("estree").Node | undefined} */ (node.arguments[0]));
        }
      },
    };
  },
};
