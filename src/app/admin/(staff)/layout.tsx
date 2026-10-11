import { AdminShell } from "@/components/admin/admin-shell";
import { requireStaff } from "@/server/auth/session";

// The check here is not the only one: layouts don't re-run on client
// navigation, so every admin page and server action checks access itself.
export default async function StaffLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();

  return <AdminShell user={user}>{children}</AdminShell>;
}
