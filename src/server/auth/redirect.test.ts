import { describe, expect, it } from "vitest";
import { adminRedirectTarget } from "./redirect";

describe("adminRedirectTarget", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/needs", "/admin/needs"],
    ["/admin/needs?status=draft", "/admin/needs?status=draft"],
  ])("keeps the admin page %s", (next, expected) => {
    expect(adminRedirectTarget(next)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    ["/admin/needs", "/admin/users"],
    "/",
    "/needs",
    "/administrator",
    "/admin/login",
    "/admin/login?next=/admin",
    "//evil.example/admin",
    "https://evil.example/admin",
    "/admin/../needs",
    "/\\evil.example",
    "javascript:alert(1)",
  ])("falls back to /admin for %j", (next) => {
    expect(adminRedirectTarget(next)).toBe("/admin");
  });
});
