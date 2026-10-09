import { formatCount } from "@/lib/plural";
import type { AuthFailure } from "./auth-client";

/** Failures after which the code step can't continue: back to the password. */
export function restartsSignIn(failure: AuthFailure): boolean {
  return (
    failure.code === "INVALID_TWO_FACTOR_COOKIE" ||
    failure.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
  );
}

const seconds = (n: number) => formatCount(n, ["секунду", "секунды", "секунд"]);

/** What happened and what to do, in the words of docs/design.md#тон-текстов. */
export function authErrorMessage(failure: AuthFailure): string {
  if (failure.status === 429 && failure.code !== "ACCOUNT_TEMPORARILY_LOCKED") {
    return failure.retryAfter
      ? `Слишком много попыток подряд. Попробуйте снова через ${seconds(failure.retryAfter)}.`
      : "Слишком много попыток подряд. Подождите минуту и попробуйте снова.";
  }

  switch (failure.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Неверный email или пароль. Проверьте раскладку и Caps Lock.";
    case "INVALID_PASSWORD":
      return "Пароль не подошёл. Введите пароль, с которым вы входили.";
    case "FAILED_TO_CREATE_SESSION":
      return "Вход для этой учётной записи закрыт. Обратитесь к владельцу приюта.";
    case "INVALID_CODE":
      return "Код не подошёл. Введите новый из приложения: коды меняются каждые 30 секунд.";
    case "INVALID_BACKUP_CODE":
      return "Резервный код не подошёл. Проверьте, нет ли опечатки; если этот код уже использовали — возьмите другой из списка.";
    case "TWO_FACTOR_REQUIRED":
      return "Сначала войдите с кодом из приложения.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Слишком много неверных кодов. Введите email и пароль ещё раз.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "Время на ввод кода вышло. Введите email и пароль ещё раз.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "После 10 неверных кодов вход закрыт на 15 минут. Подождите и попробуйте снова.";
    default:
      return failure.status === 0
        ? "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
        : "Что-то пошло не так. Попробуйте ещё раз через минуту.";
  }
}
