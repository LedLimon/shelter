import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { withUtcSession } from "./client";

// node-postgres's own parser: the URL must mean the same to it after the
// rewrite, except for `options`.
const fromHere = createRequire(import.meta.url);
const fromPg = createRequire(
  createRequire(fromHere.resolve("@prisma/adapter-pg")).resolve("pg"),
);
const { parse } = fromPg("pg-connection-string") as {
  parse: (url: string) => { options?: string } & Record<string, unknown>;
};

const withoutOptions = (url: string) => {
  const { options, ...rest } = parse(url);
  return { options, rest };
};

describe("withUtcSession", () => {
  it.each([
    "postgresql://shelter:shelter@localhost:5432/shelter",
    "postgres://u:p%40ss%3Aw%2Frd%23%2B%25@db.example.ru:6432/shelter?sslmode=verify-full",
    "postgresql://u:50%off@localhost/shelter",
    "postgresql://u:p@[::1]:5432/shelter",
    "postgresql:///shelter?host=/var/run/postgresql",
    "postgresql://u:p@localhost/shelter?application_name=a+b&ssl=true",
    "postgresql://u:p@localhost/shelter?options=-c%20statement_timeout%3D5s",
  ])("keeps the rest of %s", (url) => {
    const before = withoutOptions(url);
    const after = withoutOptions(withUtcSession(url));

    expect(after.rest).toEqual(before.rest);
    expect(after.options).toBe(
      before.options ? `${before.options} -c TimeZone=UTC` : "-c TimeZone=UTC",
    );
  });

  it("adds UTC after the last options, which node-postgres takes", () => {
    const url =
      "postgresql://u:p@localhost/db?options=-c%20a%3D1&options=-c%20b%3D2";

    expect(parse(withUtcSession(url)).options).toBe("-c b=2 -c TimeZone=UTC");
  });

  it("keeps the URL, and its password, out of the error", () => {
    let error: unknown;
    try {
      withUtcSession("postgresql://u:secret@/shelter");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TypeError);
    expect(JSON.stringify(error) + String(error)).not.toContain("secret");
  });
});
