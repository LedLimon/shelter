import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { adminRedirectTarget } from "@/server/auth/redirect";
import { getAdminAccess, TWO_FACTOR_SETUP_PATH } from "@/server/auth/session";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  const target = adminRedirectTarget((await searchParams).next);

  const access = await getAdminAccess();
  if (access.status === "granted") redirect(target);
  if (access.status === "needs-two-factor-setup")
    redirect(TWO_FACTOR_SETUP_PATH);

  return <LoginForm next={target} />;
}
