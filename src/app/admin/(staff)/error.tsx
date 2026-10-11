"use client";

import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Button } from "@/components/ui/button";

/**
 * A page of the admin threw while rendering. The frame stays; the message
 * has nothing from the error itself (it may hold personal data) but its
 * digest, which finds the full error in the server log.
 */
export default function StaffError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <>
      <PageHeader title="Страница не открылась" />
      <Panel className="max-w-3xl">
        <p className="max-w-prose">
          Что-то сломалось на стороне сайта, а не у вас. Попробуйте ещё раз;
          если не поможет — расскажите владельцу приюта, что вы делали, и
          передайте код ошибки.
        </p>
        {error.digest && (
          <p className="font-mono text-mono-sm text-toner-muted">
            Код ошибки: {error.digest}
          </p>
        )}
        <div>
          <Button onClick={() => retry()}>Попробовать ещё раз</Button>
        </div>
      </Panel>
    </>
  );
}
