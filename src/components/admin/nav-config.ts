import {
  BookOpenText,
  CalendarDays,
  Dog,
  FileChartColumn,
  HandCoins,
  HandHeart,
  LayoutDashboard,
  ListTodo,
  Newspaper,
  Package,
  Receipt,
  Repeat,
  Scale,
  ScrollText,
  Settings,
  UserCog,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission, type WithRole } from "@/server/auth/permissions";

export type AdminSection = {
  /** The route segment: /admin/<slug>. The dashboard has none. */
  slug: string;
  label: string;
  icon: LucideIcon;
  /**
   * Opens the section: the menu shows the item to roles that have it, and the
   * section's pages pass the same one to requireStaff().
   */
  permission: Permission;
};

export type AdminNavGroup = {
  /** Null for the dashboard, which stands alone above the groups. */
  title: string | null;
  sections: AdminSection[];
};

/**
 * Every section of the admin (docs/product.md#админка-admin) and who may open
 * it. A section without pages yet is served by the placeholder route
 * `admin/(staff)/[section]`; adding `admin/(staff)/<slug>/page.tsx` replaces it.
 */
export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    title: null,
    sections: [
      {
        slug: "",
        label: "Дашборд",
        icon: LayoutDashboard,
        permission: "admin.access",
      },
    ],
  },
  {
    title: "Приют",
    sections: [
      {
        slug: "needs",
        label: "Нужды",
        icon: HandHeart,
        permission: "needs.edit",
      },
      { slug: "dogs", label: "Собаки", icon: Dog, permission: "dogs.view" },
      {
        slug: "in-kind",
        label: "Вещи",
        icon: Package,
        permission: "inkind.confirm",
      },
    ],
  },
  {
    title: "Деньги",
    sections: [
      {
        slug: "donations",
        label: "Пожертвования",
        icon: HandCoins,
        permission: "donations.view",
      },
      {
        slug: "subscriptions",
        label: "Подписки",
        icon: Repeat,
        permission: "donations.view",
      },
      {
        slug: "expenses",
        label: "Расходы",
        icon: Receipt,
        permission: "expenses.draft",
      },
      {
        slug: "ledger",
        label: "Книга операций",
        icon: BookOpenText,
        permission: "ledger.settle",
      },
      {
        slug: "reports",
        label: "Отчёты",
        icon: FileChartColumn,
        permission: "reports.publish",
      },
    ],
  },
  {
    title: "Волонтёры",
    sections: [
      {
        slug: "volunteers",
        label: "Волонтёры",
        icon: Users,
        permission: "volunteers.manage",
      },
      {
        slug: "shifts",
        label: "Смены",
        icon: CalendarDays,
        permission: "volunteers.manage",
      },
      {
        slug: "tasks",
        label: "Задачи",
        icon: ListTodo,
        permission: "volunteers.manage",
      },
    ],
  },
  {
    title: "Сайт",
    sections: [
      {
        slug: "content",
        label: "Контент",
        icon: Newspaper,
        permission: "content.edit",
      },
      {
        slug: "legal",
        label: "Юридические документы",
        icon: Scale,
        permission: "legal.edit",
      },
    ],
  },
  {
    title: "Система",
    sections: [
      {
        slug: "users",
        label: "Пользователи",
        icon: UserCog,
        permission: "users.manage",
      },
      {
        slug: "settings",
        label: "Настройки",
        icon: Settings,
        permission: "settings.edit",
      },
      {
        slug: "audit",
        label: "Аудит",
        icon: ScrollText,
        permission: "audit.view",
      },
      // Raw payloads carry donor emails: the same roles as donations.
      {
        slug: "webhooks",
        label: "Вебхуки",
        icon: Webhook,
        permission: "donations.view",
      },
    ],
  },
];

export function sectionHref({ slug }: Pick<AdminSection, "slug">): string {
  return slug ? `/admin/${slug}` : "/admin";
}

/** The menu of a role: only what it may open, without empty groups. */
export function adminNavFor(user: WithRole): AdminNavGroup[] {
  return ADMIN_NAV.map(({ title, sections }) => ({
    title,
    sections: sections.filter(({ permission }) => can(user, permission)),
  })).filter(({ sections }) => sections.length > 0);
}

export function findAdminSection(slug: string): AdminSection | undefined {
  return ADMIN_NAV.flatMap(({ sections }) => sections).find(
    (section) => section.slug === slug,
  );
}
