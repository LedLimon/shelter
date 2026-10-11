import { MAX_UPLOAD_MB } from "./constraints";
import type { MediaFailure, UploadErrorCode } from "./types";

// Every text an upload can end with: what happened and what to do
// (docs/design.md#тон-текстов). Shared by the endpoints and the uploader.

export const UPLOAD_ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  unauthorized:
    "Сессия закончилась. Войдите заново в соседней вкладке и повторите загрузку.",
  forbidden:
    "Для загрузки файлов не хватает прав. Если они нужны для работы, попросите владельца приюта выдать доступ.",
  invalid:
    "Не получилось начать загрузку. Обновите страницу и попробуйте ещё раз.",
  "unsupported-type":
    "Этот формат не подходит. Загрузите фото в JPEG, PNG, WebP или HEIC.",
  "too-large": `Файл больше ${MAX_UPLOAD_MB} МБ. Уменьшите фото или выберите другое.`,
  quota:
    "Слишком много загрузок за час. Подождите немного и продолжайте с того же места.",
  "not-found":
    "Файл не найден: возможно, его уже убрали. Загрузите его заново.",
  "not-uploaded":
    "Файл не дошёл до хранилища. Попробуйте загрузить его ещё раз.",
};

/** The file never reached the server, or the answer never came back. */
export const UPLOAD_NETWORK_MESSAGE =
  "Не получилось загрузить файл. Проверьте соединение и попробуйте ещё раз.";

export const HEIC_MESSAGE =
  "Не получилось прочитать HEIC-файл. Сохраните фото как JPEG и загрузите его.";

export const EMPTY_FILE_MESSAGE = "Файл пустой. Выберите другой.";

export const MEDIA_FAILURE_MESSAGES: Record<MediaFailure, string> = {
  "not-an-image":
    "Файл не открывается как изображение. Загрузите фото в JPEG, PNG, WebP или HEIC.",
  "too-many-pixels":
    "У фото слишком большое разрешение. Уменьшите его и загрузите заново.",
  missing: "Файл не дошёл до хранилища. Загрузите его заново.",
  stuck:
    "Не получилось обработать файл. Загрузите его заново, а если не поможет — напишите администратору сайта.",
};

/** The message for a failure code, also one a newer server may send. */
export function mediaFailureMessage(failure: string | null): string {
  return (
    (MEDIA_FAILURE_MESSAGES as Record<string, string>)[failure ?? "stuck"] ??
    MEDIA_FAILURE_MESSAGES.stuck
  );
}
