import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { ADMIN_LOGIN_PATH, getAdminAccess } from "@/server/auth/session";

export const metadata: Metadata = { title: "Защита входа" };

/** First sign-in of a staff member: the only admin page open without TOTP. */
export default async function TwoFactorSetupPage() {
  const access = await getAdminAccess();
  switch (access.status) {
    case "anonymous":
    case "needs-two-factor":
      return redirect(ADMIN_LOGIN_PATH);
    case "forbidden":
      return forbidden();
    case "granted":
      return redirect("/admin");
    case "needs-two-factor-setup":
      return (
        <div className="flex flex-col gap-8">
          <TwoFactorSetup email={access.user.email} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-perforation pt-5 text-caption text-toner-muted">
            <span className="min-w-0 break-all">{access.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      );
  }
}
