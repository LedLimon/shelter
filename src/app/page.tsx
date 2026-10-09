import { PawPrint } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-gutter py-section text-center">
      <PawPrint aria-hidden className="size-12 text-toner-muted" />
      <h1 className="text-section">Сайт приюта&nbsp;— скоро</h1>
      <p className="max-w-prose text-balance text-toner-muted">
        Мы готовим сайт: здесь появятся нужды приюта, открытые отчёты
        о&nbsp;сборах и&nbsp;собаки, которые ждут дом.
      </p>
    </main>
  );
}
