"use client";

import { ChevronDown, CircleUser, House, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  readThemePreference,
  subscribeToThemePreference,
  THEME_PREFERENCES,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Системная",
  light: "Светлая",
  dark: "Тёмная",
};

/** Who is signed in, the theme, the way to the public site and out. */
export function UserMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  // The choice lives in localStorage, so nothing is checked until hydration.
  const theme = useSyncExternalStore(
    subscribeToThemePreference,
    readThemePreference,
    () => null,
  );

  function signOut() {
    setLeaving(true);
    void authClient
      .signOut()
      .catch(() => undefined)
      .then(() => {
        router.replace("/admin/login");
        router.refresh();
      });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            // The name gives way to the rest of the header and is cut short.
            className="max-w-full min-w-0 shrink gap-1.5 px-2 font-body text-caption normal-case"
          />
        }
      >
        <CircleUser aria-hidden className="size-5" />
        {/* The phone header has room for the icon only; the menu has both in full. */}
        <span className="truncate max-sm:sr-only">{name}</span>
        <span className="shrink-0 text-toner-muted max-md:sr-only">
          · {role}
        </span>
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <p className="px-3 pt-2 pb-1 text-caption">
          <span className="font-bold">{name}</span>
          <span className="text-toner-muted"> · {role}</span>
        </p>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Тема</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value: ThemePreference) =>
              writeThemePreference(value)
            }
          >
            {THEME_PREFERENCES.map((value) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                closeOnClick={false}
              >
                {THEME_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/" />}>
          <House aria-hidden />
          На сайт приюта
        </DropdownMenuLinkItem>
        <DropdownMenuItem
          closeOnClick={false}
          disabled={leaving}
          onClick={signOut}
        >
          {leaving ? <Spinner aria-hidden /> : <LogOut aria-hidden />}
          {leaving ? "Выходим…" : "Выйти"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
