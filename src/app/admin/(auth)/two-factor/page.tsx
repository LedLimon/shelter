import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";
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
      return <TwoFactorSetup email={access.user.email} />;
  }
}
