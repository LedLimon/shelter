"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      onClick={() => {
        setPending(true);
        void authClient
          .signOut()
          .catch(() => undefined)
          .then(() => {
            router.replace("/admin/login");
            router.refresh();
          });
      }}
    >
      Выйти
    </Button>
  );
}
