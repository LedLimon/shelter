import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeError, describeMessage } from "./errors";

describe("describeError", () => {
  it("gives the error's name and message on one line", () => {
    expect(describeError(new TypeError("fetch failed:\n  ECONNRESET"))).toBe(
      "TypeError: fetch failed: ECONNRESET",
    );
  });

  it("masks emails and phone numbers", () => {
    const error = new Error(
      "550 <anna.ivanova@example.ru> rejected, call +7 (900) 123-45-67",
    );

    expect(describeError(error)).toBe(
      "Error: 550 <[email]> rejected, call [number]",
    );
  });

  it("describes a zod error by paths and codes, without the rejected values", () => {
    const result = z
      .object({ email: z.email(), amountKop: z.number().int() })
      .safeParse({ email: "Анна <anna@example.ru>", amountKop: 10.5 });

    expect(describeError(result.error)).toBe(
      "ZodError: email: invalid_format; amountKop: invalid_type",
    );
  });

  it("keeps only the code of a Prisma error: its message quotes the query", () => {
    class PrismaClientKnownRequestError extends Error {
      override name = "PrismaClientKnownRequestError";
      code = "P2002";
    }
    class PrismaClientValidationError extends Error {
      override name = "PrismaClientValidationError";
    }
    const message =
      'Invalid `prisma.user.create()` invocation: { data: { name: "Анна Иванова" } }';

    expect(describeError(new PrismaClientKnownRequestError(message))).toBe(
      "PrismaClientKnownRequestError: P2002",
    );
    expect(describeError(new PrismaClientValidationError(message))).toBe(
      "PrismaClientValidationError: message withheld (it quotes query arguments)",
    );
  });

  it("cuts a long message", () => {
    expect(describeError(new Error("x".repeat(2_000)))).toHaveLength(500);
  });

  it("doesn't choke on an error that quotes a megabyte of a response", () => {
    const started = performance.now();

    describeError(new Error(`bad image: ${"QUJD".repeat(250_000)}`));

    // Unbounded, the email pattern takes minutes on this.
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("drops control characters: Postgres would refuse a NUL in lastError", () => {
    expect(
      describeError(new Error("bad \u0000 byte\u0007 from provider")),
    ).toBe("Error: bad byte from provider");
  });

  it("describes a bare message the same way", () => {
    expect(describeMessage("connect to anna@example.ru\n  failed")).toBe(
      "connect to [email] failed",
    );
  });

  it("doesn't print a thrown value that is not an Error", () => {
    expect(describeError({ email: "anna@example.ru" })).toBe(
      "a non-Error value was thrown",
    );
  });
});
