// shelter/ledger-boundary: only src/server/ledger touches the Ledger* tables
// (AGENTS.md, invariant 2; docs/ledger.md#инварианты). Everyone else calls the
// functions exported by "@/server/ledger".
//
// Reports, outside the files the config exempts:
// - Prisma delegates: db.ledgerEntry…, tx["ledgerTransaction"];
// - relations to Ledger* models, which are named after them (ledgerAccount,
//   ledgerTransactions…, docs/architecture.md#соглашения-схемы), as object
//   keys: include: { ledgerTransactions: true }, data: { ledgerTransactions:
//   { create: … } } — a nested write through a relation would skip the
//   module's checks — and in destructuring. The names are reserved: other
//   code names its own fields differently (entries, rows…);
// - the tables in SQL strings and $queryRaw templates: "LedgerEntry"…;
// - imports of the module's internals: "@/server/ledger/post", "../ledger/post".
import path from "node:path";

const DELEGATE = /^ledger(?:Account|Transaction|Entry)$/;
const RELATION = /^ledger(?:Accounts?|Transactions?|Entry|Entries)$/;
const TABLE = /"Ledger(?:Account|Transaction|Entry)"/;
// From this file, not from ESLint's cwd: an editor may run it from src/.
const ROOT = path.resolve(import.meta.dirname, "..");
const MODULE_DIR = path.join(ROOT, "src/server/ledger");

/** @param {import("estree").Node | null | undefined} node */
function staticName(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/**
 * "@/server/ledger/post" or a relative path into src/server/ledger, other
 * than the module itself ("@/server/ledger", "../ledger", "../ledger/index").
 * @param {string} source @param {string} filename
 */
function isInternalImport(source, filename) {
  let target;
  if (source.startsWith("@/")) {
    target = path.join(ROOT, "src", source.slice(2));
  } else if (source.startsWith(".")) {
    target = path.resolve(path.dirname(filename), source);
  } else {
    return false;
  }
  const inside = path.relative(MODULE_DIR, target);
  return (
    inside !== "" &&
    !inside.startsWith("..") &&
    !path.isAbsolute(inside) &&
    !/^index(?:\.[cm]?[jt]sx?)?$/.test(inside)
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const ledgerBoundary = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only src/server/ledger reads and writes the ledger tables (docs/ledger.md).",
    },
    schema: [],
    messages: {
      delegate:
        "Only src/server/ledger uses prisma.{{name}}: call a function from @/server/ledger.",
      relation:
        "{{name}} is reserved for the Prisma relation to the ledger: only src/server/ledger includes or writes it (call @/server/ledger); name your own fields differently (entries, rows…).",
      sql: "Only src/server/ledger queries the Ledger* tables: call a function from @/server/ledger.",
      internal:
        'Import the ledger from "@/server/ledger", not from its internals.',
    },
  },
  create(context) {
    /**
     * @param {import("estree").Node} node @param {string | undefined} name
     * @param {RegExp} pattern @param {"delegate" | "relation"} messageId
     */
    const checkName = (node, name, pattern, messageId) => {
      if (name && pattern.test(name)) {
        context.report({ node, messageId, data: { name } });
      }
    };
    /** @param {import("estree").Node | null | undefined} source */
    const checkSource = (source) => {
      const value = staticName(source);
      if (
        source &&
        value !== undefined &&
        isInternalImport(value, context.filename)
      ) {
        context.report({ node: source, messageId: "internal" });
      }
    };

    return {
      // db.ledgerEntry, db["ledgerEntry"], not db[variable]. Reading a
      // relation off a result needs an include, which Property catches.
      MemberExpression(node) {
        if (!node.computed || node.property.type !== "Identifier") {
          checkName(
            node.property,
            staticName(node.property),
            DELEGATE,
            "delegate",
          );
        }
      },
      // Object literals (include, select, data) and destructuring alike.
      Property(node) {
        if (!node.computed || node.key.type !== "Identifier") {
          checkName(node.key, staticName(node.key), RELATION, "relation");
        }
      },
      Literal(node) {
        if (typeof node.value === "string" && TABLE.test(node.value)) {
          context.report({ node, messageId: "sql" });
        }
      },
      TemplateElement(node) {
        if (TABLE.test(node.value.raw)) {
          context.report({ node, messageId: "sql" });
        }
      },
      ImportDeclaration: (node) => checkSource(node.source),
      ExportNamedDeclaration: (node) => checkSource(node.source),
      ExportAllDeclaration: (node) => checkSource(node.source),
      ImportExpression: (node) => checkSource(node.source),
    };
  },
};

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "shelter" },
  rules: { "ledger-boundary": ledgerBoundary },
};

export default plugin;
