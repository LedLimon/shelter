import { requireStaff } from "@/server/auth/session";

export default async function AdminHomePage() {
  const user = await requireStaff();

  return (
    <main className="flex flex-1 flex-col gap-4 px-gutter py-section">
      <h1 className="text-section">Здравствуйте, {user.name}</h1>
      <p className="max-w-prose text-toner-muted">
        Вход защищён кодом из приложения. Разделы админки — нужды,
        пожертвования, расходы, собаки — появятся здесь по мере готовности.
      </p>
    </main>
  );
}
