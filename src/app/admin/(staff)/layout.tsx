import { SignOutButton } from "@/components/auth/sign-out-button";
import { ROLE_LABELS } from "@/components/auth/role-label";
import { requireStaff } from "@/server/auth/session";

// Minimal shell until the admin layout of FND-7. The check here is not the
// only one: layouts don't re-run on client navigation, so every admin page
// and server action checks access itself.
export default async function StaffLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-paper px-gutter py-3 shadow-sheet">
        <span className="font-display text-label uppercase">
          Сайт приюта · админка
        </span>
        <div className="flex flex-wrap items-center gap-3 text-caption">
          <span>
            {user.name}
            <span className="text-toner-muted">
              {" "}
              · {ROLE_LABELS[user.role]}
            </span>
          </span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
