import { fileURLToPath } from "node:url";
import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import plugin from "./ledger-boundary.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = plugin.rules?.["ledger-boundary"];
if (!rule || typeof rule === "function") throw new Error("rule not found");

const root = fileURLToPath(new URL("..", import.meta.url));
const outside = `${root}/src/server/needs/index.ts`;

new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
}).run("shelter/ledger-boundary", rule, {
  valid: [
    'import { post, balance } from "@/server/ledger";',
    'const ledger = await import("@/server/ledger");',
    "db.need.findMany();",
    "db.ledger.find();",
    "const key = db[ledgerEntry];",
    // Reading a relation off a result: getting it there takes an include.
    "const total = user.ledgerTransactions.length;",
    // A foreign key column, not the relation (Need.ledgerAccountId).
    "db.need.create({ data: { ledgerAccountId: id } });",
    'db.$queryRaw`SELECT * FROM "Need"`;',
    'const label = "LedgerEntry";',
    { code: 'import { post } from "../ledger";', filename: outside },
    { code: 'import { post } from "../ledger/index";', filename: outside },
    { code: 'import { x } from "./ledgerish";', filename: outside },
  ],
  invalid: [
    {
      code: "await tx.ledgerEntry.create({ data });",
      errors: [{ messageId: "delegate", data: { name: "ledgerEntry" } }],
    },
    {
      code: "await getDb().ledgerTransaction.findMany();",
      errors: [{ messageId: "delegate" }],
    },
    {
      code: 'db["ledgerAccount"].count();',
      errors: [{ messageId: "delegate" }],
    },
    {
      code: "db[`ledgerEntry`].count();",
      errors: [{ messageId: "delegate" }],
    },
    {
      code: "const { ledgerEntry } = db;",
      errors: [{ messageId: "relation" }],
    },
    {
      // A nested write through a relation skips the module's checks.
      code: "db.user.update({ where, data: { ledgerTransactions: { create: tx } } });",
      errors: [{ messageId: "relation", data: { name: "ledgerTransactions" } }],
    },
    {
      code: "db.need.findMany({ include: { ledgerAccount: { include: { entries: true } } } });",
      errors: [{ messageId: "relation", data: { name: "ledgerAccount" } }],
    },
    {
      // The names are reserved for the relations, DTOs included.
      code: "function Table({ ledgerEntries }) {}",
      errors: [{ messageId: "relation" }],
    },
    {
      code: 'await db.$executeRaw`DELETE FROM "LedgerEntry" WHERE id = ${id}`;',
      errors: [{ messageId: "sql" }],
    },
    {
      code: 'await db.$queryRawUnsafe(\'SELECT SUM("amountKop") FROM "LedgerEntry"\');',
      errors: [{ messageId: "sql" }],
    },
    {
      code: 'import { insertTransaction } from "@/server/ledger/post";',
      errors: [{ messageId: "internal" }],
    },
    {
      code: 'import { assertTransaction } from "../ledger/transaction";',
      filename: outside,
      errors: [{ messageId: "internal" }],
    },
    {
      code: 'export { post } from "@/server/ledger/post";',
      errors: [{ messageId: "internal" }],
    },
    {
      code: 'const m = await import("@/server/ledger/balance");',
      errors: [{ messageId: "internal" }],
    },
  ],
});

// Loading the whole config takes a second or two on a slow runner.
describe("eslint.config.mjs", { timeout: 30_000 }, () => {
  const eslint = new ESLint({ cwd: root });
  const severity = async (file: string): Promise<unknown> => {
    const config = (await eslint.calculateConfigForFile(file)) as
      { rules?: Record<string, unknown> } | undefined;
    const setting = config?.rules?.["shelter/ledger-boundary"];
    return Array.isArray(setting) ? setting[0] : setting;
  };

  it.each([
    "src/server/needs/index.ts",
    "src/app/admin/ledger/page.tsx",
    "src/lib/money.test.ts",
    "tests/integration/settings.test.ts",
    "prisma/seed.ts",
  ])("applies the rule to %s", async (file) => {
    expect(await severity(file)).toBe(2);
  });

  it.each([
    "src/server/ledger/post.ts",
    "src/server/ledger/input.test.ts",
    "tests/integration/ledger/triggers.test.ts",
  ])("exempts %s", async (file) => {
    expect(await severity(file)).toBeUndefined();
  });
});
