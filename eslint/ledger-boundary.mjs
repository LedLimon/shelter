// shelter/ledger-boundary: only src/server/ledger touches the Ledger* tables
// (AGENTS.md, invariant 2; docs/ledger.md#инварианты). Everyone else calls the
// functions exported by "@/server/ledger".
//
// Reports, outside the files the config exempts:
// - Prisma delegates and relations: db.ledgerEntry…, tx["ledgerTransaction"],
//   const { ledgerAccount } = db, include: { ledgerTransactions: true },
//   data: { ledgerTransactions: { create: … } } — a nested write through a
//   relation would skip the module's checks. Relations to Ledger* models are
//   named after them (ledgerAccount, ledgerTransactions…), see
//   docs/architecture.md#соглашения-схемы;
// - the tables in SQL strings and $queryRaw templates: "LedgerEntry"…;
// - imports of the module's internals: "@/server/ledger/post", "../ledger/post".
import path from "node:path";

const MODEL_FIELD = /^ledger(?:Accounts?|Transactions?|Entry|Entries)$/;
const TABLE = /"Ledger(?:Account|Transaction|Entry)"/;
const MODULE_DIR = "src/server/ledger";

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
 * @param {string} source @param {string} filename @param {string} cwd
 */
function isInternalImport(source, filename, cwd) {
  let target;
  if (source.startsWith("@/")) {
    target = path.join(cwd, "src", source.slice(2));
  } else if (source.startsWith(".")) {
    target = path.resolve(path.dirname(filename), source);
  } else {
    return false;
  }
  const inside = path.relative(path.join(cwd, MODULE_DIR), target);
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
      model:
        "Only src/server/ledger uses {{name}}: call a function from @/server/ledger.",
      sql: "Only src/server/ledger queries the Ledger* tables: call a function from @/server/ledger.",
      internal:
        'Import the ledger from "@/server/ledger", not from its internals.',
    },
  },
  create(context) {
    /** @param {import("estree").Node} node @param {string | undefined} name */
    const checkName = (node, name) => {
      if (name && MODEL_FIELD.test(name)) {
        context.report({ node, messageId: "model", data: { name } });
      }
    };
    /** @param {import("estree").Node | null | undefined} source */
    const checkSource = (source) => {
      const value = staticName(source);
      if (
        source &&
        value !== undefined &&
        isInternalImport(value, context.filename, context.cwd)
      ) {
        context.report({ node: source, messageId: "internal" });
      }
    };

    return {
      // db.ledgerEntry, db["ledgerEntry"], not db[variable].
      MemberExpression(node) {
        if (!node.computed || node.property.type !== "Identifier") {
          checkName(node.property, staticName(node.property));
        }
      },
      // Object literals (include, select, data) and destructuring alike.
      Property(node) {
        if (!node.computed || node.key.type !== "Identifier") {
          checkName(node.key, staticName(node.key));
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
