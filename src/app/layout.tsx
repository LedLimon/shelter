import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Сайт приюта",
  description: "Скоро здесь появится сайт приюта для собак.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
