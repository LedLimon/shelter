import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/enums";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  ADMIN_NAV,
  adminNavFor,
  findAdminSection,
  sectionHref,
} from "./nav-config";
import { isSectionPath } from "./nav-path";

const labelsFor = (role: UserRole) =>
  adminNavFor({ role }).flatMap(({ sections }) =>
    sections.map(({ label }) => label),
  );

// Written out by hand, like the permission matrix: who sees what in the menu
// is a product decision (docs/product.md#роли), not a by-product of the code.
const EXPECTED: Record<UserRole, string[]> = {
  DONOR: [],
  VOLUNTEER: [],
  COORDINATOR: ["Дашборд", "Собаки", "Волонтёры", "Смены", "Задачи"],
  EDITOR: ["Дашборд", "Нужды", "Собаки", "Расходы", "Контент"],
  ADMIN: [
    "Дашборд",
    "Нужды",
    "Собаки",
    "Вещи",
    "Пожертвования",
    "Подписки",
    "Расходы",
    "Книга операций",
    "Контент",
    "Вебхуки",
  ],
  OWNER: ADMIN_NAV.flatMap(({ sections }) =>
    sections.map(({ label }) => label),
  ),
};

describe("admin menu", () => {
  it.each(Object.values(UserRole))("%s sees exactly its sections", (role) => {
    expect(labelsFor(role)).toEqual(EXPECTED[role]);
  });

  it("drops the groups a role has nothing in", () => {
    const titles = adminNavFor({ role: "COORDINATOR" }).map(
      ({ title }) => title,
    );

    expect(titles).toEqual([null, "Приют", "Волонтёры"]);
  });

  it("covers every section of docs/architecture.md#маршруты once", () => {
    const slugs = ADMIN_NAV.flatMap(({ sections }) =>
      sections.map(({ slug }) => slug),
    );

    expect([...slugs].sort()).toEqual(
      [
        "",
        "audit",
        "content",
        "dogs",
        "donations",
        "expenses",
        "in-kind",
        "ledger",
        "legal",
        "needs",
        "reports",
        "settings",
        "shifts",
        "subscriptions",
        "tasks",
        "users",
        "volunteers",
        "webhooks",
      ].sort(),
    );
  });

  it("opens every section with a permission that exists", () => {
    for (const { sections } of ADMIN_NAV) {
      for (const { permission } of sections) {
        expect(PERMISSIONS).toHaveProperty([permission]);
      }
    }
  });

  it("links the dashboard to /admin and sections to /admin/<slug>", () => {
    expect(sectionHref({ slug: "" })).toBe("/admin");
    expect(sectionHref({ slug: "in-kind" })).toBe("/admin/in-kind");
  });

  it("finds a section by its slug", () => {
    expect(findAdminSection("settings")?.permission).toBe("settings.edit");
    expect(findAdminSection("nope")).toBeUndefined();
  });
});

describe("isSectionPath", () => {
  it("marks the dashboard only on /admin itself", () => {
    expect(isSectionPath("/admin", "/admin")).toBe(true);
    expect(isSectionPath("/admin/needs", "/admin")).toBe(false);
  });

  it("marks a section on its nested pages too", () => {
    expect(isSectionPath("/admin/needs", "/admin/needs")).toBe(true);
    expect(isSectionPath("/admin/needs/42/edit", "/admin/needs")).toBe(true);
  });

  it("doesn't mix up sections with a common prefix", () => {
    expect(isSectionPath("/admin/tasks-archive", "/admin/tasks")).toBe(false);
    expect(isSectionPath("/admin/dogs", "/admin/needs")).toBe(false);
  });
});
