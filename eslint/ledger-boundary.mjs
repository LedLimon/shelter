// shelter/ledger-boundary: only src/server/ledger touches the Ledger* tables
// (AGENTS.md, invariant 2; docs/ledger.md#инварианты). Everyone else calls the
// functions exported by "@/server/ledger".
//
// Reports, outside the files the config exempts:
// - Prisma delegates: db.ledgerEntry…, tx["ledgerTransaction"], const { ledgerAccount } = db;
// - the tables in SQL strings and $queryRaw templates: "LedgerEntry"…;
// - imports of the module's internals: "@/server/ledger/post".

const DELEGATES = new Set([
  "ledgerAccount",
  "ledgerTransaction",
  "ledgerEntry",
]);
const TABLE = /"Ledger(?:Account|Transaction|Entry)"/;
const INTERNAL = /^@\/server\/ledger\/./;

/** @param {import("estree").Node | null | undefined} node */
function keyName(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return undefined;
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
      sql: "Only src/server/ledger queries the Ledger* tables: call a function from @/server/ledger.",
      internal:
        'Import the ledger from "@/server/ledger", not from its internals.',
    },
  },
  create(context) {
    /** @param {import("estree").Node} node @param {string | undefined} name */
    const checkDelegate = (node, name) => {
      if (name && DELEGATES.has(name)) {
        context.report({ node, messageId: "delegate", data: { name } });
      }
    };
    /** @param {import("estree").Literal | null | undefined} source */
    const checkSource = (source) => {
      if (
        source &&
        typeof source.value === "string" &&
        INTERNAL.test(source.value)
      ) {
        context.report({ node: source, messageId: "internal" });
      }
    };

    return {
      MemberExpression(node) {
        const name = node.computed
          ? keyName(node.property.type === "Literal" ? node.property : null)
          : keyName(node.property);
        checkDelegate(node.property, name);
      },
      "ObjectPattern > Property"(node) {
        if (!node.computed) checkDelegate(node.key, keyName(node.key));
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
      ImportExpression(node) {
        if (node.source.type === "Literal") checkSource(node.source);
      },
    };
  },
};

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "shelter" },
  rules: { "ledger-boundary": ledgerBoundary },
};

export default plugin;
