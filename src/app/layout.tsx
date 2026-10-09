import type { Metadata } from "next";

import { cn } from "@/lib/utils";

import { bodyFont, displayFont, monoFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Сайт приюта",
  description: "Скоро здесь появится сайт приюта для собак.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={cn(displayFont.variable, bodyFont.variable, monoFont.variable)}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
