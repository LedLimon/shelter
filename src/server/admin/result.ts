// What a server action made with adminAction() returns. Free of server
// imports: forms and tables read these types and messages in the browser.

/**
 * - `validation` — the input didn't pass; `fieldErrors` maps a field path
 *   (`requisites.inn`, `oneTime.2.amount`) to its message.
 * - `unauthorized` — no staff session (it ended, or the role was taken away).
 * - `forbidden` — the role lacks the permission.
 * - `failed` — the action refused for a reason the user can act on.
 */
export type ActionFailure = {
  code: "validation" | "unauthorized" | "forbidden" | "failed";
  /** Shown to the user: what happened and what to do. */
  message: string;
  fieldErrors?: Record<string, string>;
};

export type ActionResult<Data = void> =
  { ok: true; data: Data } | { ok: false; error: ActionFailure };

export const ACTION_MESSAGES = {
  validation: "Проверьте поля: в некоторых есть ошибки.",
  unauthorized:
    "Сессия закончилась. Войдите заново и повторите действие — введённое останется на месте.",
  forbidden:
    "Для этого действия не хватает прав. Если они нужны для работы, попросите владельца приюта.",
  /** The action threw, or the request didn't reach the server. */
  unexpected:
    "Не получилось сохранить. Проверьте соединение и попробуйте ещё раз.",
} as const;

/**
 * Thrown inside an adminAction handler to refuse with a message for the user,
 * optionally pointing at fields. The action's transaction rolls back.
 */
export class ActionError extends Error {
  override name = "ActionError";

  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
