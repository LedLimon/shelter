import { PawPrint } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <PawPrint aria-hidden className="size-12 text-muted-foreground" />
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Сайт приюта&nbsp;— скоро
      </h1>
      <p className="max-w-prose text-balance text-muted-foreground">
        Мы готовим сайт: здесь появятся нужды приюта, открытые отчёты
        о&nbsp;сборах и&nbsp;собаки, которые ждут дом.
      </p>
    </main>
  );
}
