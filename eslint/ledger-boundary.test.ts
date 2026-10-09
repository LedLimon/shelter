import { fileURLToPath } from "node:url";
import { ESLint, RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import plugin from "./ledger-boundary.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = plugin.rules?.["ledger-boundary"];
if (!rule || typeof rule === "function") throw new Error("rule not found");

new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
}).run("shelter/ledger-boundary", rule, {
  valid: [
    'import { post, balance } from "@/server/ledger";',
    'const ledger = await import("@/server/ledger");',
    "db.need.findMany();",
    "db.ledger.find();",
    "const ledgerEntries = rows.ledgerEntries;",
    'db.$queryRaw`SELECT * FROM "Need"`;',
    'const label = "LedgerEntry";',
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
      code: "const { ledgerEntry } = db;",
      errors: [{ messageId: "delegate" }],
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
      code: 'export { post } from "@/server/ledger/post";',
      errors: [{ messageId: "internal" }],
    },
    {
      code: 'const m = await import("@/server/ledger/balance");',
      errors: [{ messageId: "internal" }],
    },
  ],
});

describe("eslint.config.mjs", () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
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
