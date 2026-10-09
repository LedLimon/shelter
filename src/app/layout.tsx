import type { Metadata } from "next";

import { ThemeScript } from "@/components/theme/theme-script";
import { cn } from "@/lib/utils";

import { bodyFont, displayFont, monoFont, roubleFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Сайт приюта",
  description: "Скоро здесь появится сайт приюта для собак.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // ThemeScript adds the `dark` class before React hydrates <html>.
    <html
      lang="ru"
      className={cn(
        displayFont.variable,
        roubleFont.variable,
        bodyFont.variable,
        monoFont.variable,
      )}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
