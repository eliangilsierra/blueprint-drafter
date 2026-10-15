// Local ESLint rule: the global objects that lead to processes, modules or code loading may be used in src/core
// only through a direct, non-computed member access of an allowed property (issue #59, NFR-8).
//
// The deny-list of eslint.config.core.js names `process.getBuiltinModule`, `globalThis.fetch` and similar
// members, so it misses every form that hides the member: an alias (`const p = process`), destructuring
// (`const { getBuiltinModule } = process`), a computed access (`globalThis["fe" + "tch"]`) or passing the object
// on (`Reflect.get(process, name)`). This rule rejects any use of the listed globals as a value, so those forms
// cannot be written at all. It uses scope analysis: a local variable with the same name is not the global, and
// property keys and type positions are not references. An ambient declaration (`declare const process: any`)
// creates no runtime binding, so it is rejected instead of being treated as a local variable.
//
// `require` (CommonJS files: .cts) may only be called directly with its argument, which core-imports checks;
// `require.call(...)`, `const r = require` or `module.require(...)` are rejected.

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Restrict process, globalThis, global, module and require in src/core to direct allowed uses" },
    schema: [
      {
        type: "object",
        properties: {
          allowedMembers: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" }, uniqueItems: true },
          },
        },
        required: ["allowedMembers"],
        additionalProperties: false,
      },
    ],
    messages: {
      member:
        "src/core may use `{{name}}` only as {{allowed}}: an alias, destructuring, computed access or passing it on hides what is used. Use an adapter instead.",
      require: "src/core may call `require` only directly with a string literal (checked by the import allow-list).",
      declaration:
        "src/core must not declare `{{name}}` with `declare`: an ambient declaration hides the global from the isolation rules.",
    },
  },

  create(context) {
    const [options] = context.options;
    /** @type {Map<string, Set<string>>} */
    const allowed = new Map(
      Object.entries(options.allowedMembers).map(([name, members]) => [name, new Set(/** @type {string[]} */ (members))]),
    );
    const restricted = new Set([...allowed.keys(), "require"]);

    /**
     * @param {any} identifier
     * @returns {boolean} true when the reference only names the global in a type position
     */
    function inTypePosition(identifier) {
      for (let node = identifier.parent; node; node = node.parent) {
        if (node.type === "TSTypeQuery") {
          return true;
        }
        if (node.type !== "TSQualifiedName") {
          return false;
        }
      }
      return false;
    }

    /**
     * @param {any} node
     * @returns {boolean} true when the node is inside an ambient (`declare`) declaration
     */
    function isAmbient(node) {
      for (let current = node; current; current = current.parent) {
        if (current.declare === true || current.type === "TSDeclareFunction") {
          return true;
        }
      }
      return false;
    }

    /**
     * @param {any} identifier
     */
    function checkReference(identifier) {
      const name = identifier.name;
      const parent = identifier.parent;
      if (inTypePosition(identifier)) {
        return;
      }
      if (name === "require") {
        if (!(parent.type === "CallExpression" && parent.callee === identifier)) {
          context.report({ node: identifier, messageId: "require" });
        }
        return;
      }
      const members = allowed.get(name) ?? new Set();
      const isAllowedRead =
        parent.type === "MemberExpression" &&
        parent.object === identifier &&
        !parent.computed &&
        parent.property.type === "Identifier" &&
        members.has(parent.property.name) &&
        !(parent.parent.type === "AssignmentExpression" && parent.parent.left === parent) &&
        !(parent.parent.type === "UpdateExpression") &&
        !(parent.parent.type === "UnaryExpression" && parent.parent.operator === "delete");
      if (!isAllowedRead) {
        const list = [...members].sort().map((member) => `\`${name}.${member}\``);
        context.report({
          node: identifier,
          messageId: "member",
          data: { name, allowed: list.length > 0 ? `${list.join(", ")} (read only)` : "nothing (no use is allowed)" },
        });
      }
    }

    return {
      "Program:exit"(program) {
        const globalScope = context.sourceCode.getScope(program);
        for (const reference of globalScope.through) {
          if (restricted.has(reference.identifier.name) && reference.isValueReference !== false) {
            checkReference(reference.identifier);
          }
        }
        // References that resolve to a variable. A real local declaration (`const process = ...`) creates its own
        // binding, so its references are not the global. A variable with no definition (declared through
        // languageOptions.globals or the TypeScript lib) is the global. An ambient declaration
        // (`declare const process: any`) creates no runtime binding but would hide the global from this analysis,
        // so it is rejected and its references are checked as the global's.
        for (const scope of context.sourceCode.scopeManager?.scopes ?? []) {
          for (const variable of scope.variables) {
            if (!restricted.has(variable.name)) {
              continue;
            }
            const ambient = variable.defs.filter((definition) => isAmbient(definition.name));
            if (variable.defs.length > 0 && ambient.length === 0) {
              continue;
            }
            for (const definition of ambient) {
              context.report({ node: definition.name, messageId: "declaration", data: { name: variable.name } });
            }
            for (const reference of variable.references) {
              if (reference.isValueReference !== false) {
                checkReference(reference.identifier);
              }
            }
          }
        }
      },
    };
  },
};
