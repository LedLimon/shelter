"use client";

import { useRef, useState } from "react";
import {
  ACTION_MESSAGES,
  type ActionFailure,
  type ActionResult,
} from "@/server/admin/result";

/**
 * Runs an adminAction() server action from a button rather than a form
 * (publish, delete, create): one call at a time, `pending` for the button's
 * spinner, `failure` for <ActionFailureAlert> next to it. Forms use
 * useActionForm() instead.
 */
export function useAdminAction() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const busy = useRef(false);

  /** Calls the action; `onSuccess` gets its data. A second click meanwhile is ignored. */
  async function run<Data>(
    call: () => Promise<ActionResult<Data>>,
    onSuccess: (data: Data) => void,
  ): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure(null);

    let result: ActionResult<Data>;
    try {
      result = await call();
    } catch {
      // The action threw, or the request never reached the server.
      result = {
        ok: false,
        error: { code: "failed", message: ACTION_MESSAGES.unexpected },
      };
    }

    busy.current = false;
    setPending(false);
    if (result.ok) onSuccess(result.data);
    else setFailure(result.error);
  }

  return { run, pending, failure, clearFailure: () => setFailure(null) };
}
