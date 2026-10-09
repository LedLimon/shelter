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
      variant="outline"
      disabled={pending}
      className="h-11 px-4 font-display text-label uppercase"
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
      {pending ? "Выходим…" : "Выйти"}
    </Button>
  );
}
