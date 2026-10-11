import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { assertCan } from "@/server/auth/permissions";
import type { StaffUser } from "@/server/auth/session";
import { adminAction } from "./action";
import { ACTION_MESSAGES, ActionError } from "./result";

const mocks = vi.hoisted(() => ({
  getStaffUser: vi.fn<() => Promise<StaffUser | null>>(),
  recordAudit: vi.fn(),
  updateTag: vi.fn(),
  /** What happened, in order: the transaction's boundaries and the cache. */
  events: [] as string[],
}));

/** Stands in for the transaction client the handler writes through. */
const tx = { transaction: true };

vi.mock("@/server/auth/session", () => ({
  getStaffUser: mocks.getStaffUser,
}));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));
vi.mock("@/server/db", () => ({
  getDb: () => ({
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) => {
      mocks.events.push("begin");
      try {
        const result = await run(tx);
        mocks.events.push("commit");
        return result;
      } catch (error) {
        mocks.events.push("rollback");
        throw error;
      }
    },
  }),
}));

const owner: StaffUser = {
  id: "user-owner",
  email: "owner@shelter.localhost",
  name: "Ирина",
  role: "OWNER",
};
const editor: StaffUser = { ...owner, id: "user-editor", role: "EDITOR" };

const schema = z.object({
  title: z.string().trim().min(1, "Введите название."),
  contacts: z.object({ email: z.email("Проверьте адрес.") }),
});
const input = { title: " Корм ", contacts: { email: "info@priyut.ru" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.events.length = 0;
  mocks.getStaffUser.mockResolvedValue(owner);
  mocks.updateTag.mockImplementation((tag: string) => {
    mocks.events.push(`updateTag:${tag}`);
  });
});

describe("adminAction", () => {
  it("runs the handler with the parsed input, the user and the transaction", async () => {
    const handler = vi.fn(() => Promise.resolve({ id: "need-1" }));
    const action = adminAction(schema, "needs.edit", handler);

    const result = await action(input);

    expect(result).toEqual({ ok: true, data: { id: "need-1" } });
    expect(handler).toHaveBeenCalledExactlyOnceWith(
      { title: "Корм", contacts: { email: "info@priyut.ru" } },
      expect.objectContaining({ user: owner, db: tx }),
    );
  });

  it("refuses without a staff session and does nothing", async () => {
    mocks.getStaffUser.mockResolvedValue(null);
    const handler = vi.fn();

    const result = await adminAction(schema, "needs.edit", handler)(input);

    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: ACTION_MESSAGES.unauthorized },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.events).toEqual([]);
  });

  it("refuses a role without the permission and does nothing", async () => {
    mocks.getStaffUser.mockResolvedValue(editor);
    const handler = vi.fn();

    const result = await adminAction(schema, "settings.edit", handler)(input);

    expect(result).toEqual({
      ok: false,
      error: { code: "forbidden", message: ACTION_MESSAGES.forbidden },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.events).toEqual([]);
  });

  it("checks the permission before the input", async () => {
    mocks.getStaffUser.mockResolvedValue(editor);

    const result = await adminAction(
      schema,
      "settings.edit",
      vi.fn(),
    )({ title: "", contacts: { email: "nope" } });

    expect(result).toMatchObject({ error: { code: "forbidden" } });
  });

  it("returns the first message of every invalid field by its path", async () => {
    const handler = vi.fn();

    const result = await adminAction(
      schema,
      "needs.edit",
      handler,
    )({ title: "  ", contacts: { email: "nope" } });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation",
        message: ACTION_MESSAGES.validation,
        fieldErrors: {
          title: "Введите название.",
          "contacts.email": "Проверьте адрес.",
        },
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.events).toEqual([]);
  });

  it("validates whatever the browser sends, not only what the type allows", async () => {
    const action = adminAction(schema, "needs.edit", vi.fn());

    const result = await action(null as unknown as typeof input);

    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it("records the audit entries inside the handler's transaction", async () => {
    const entry = { action: "need.create", entity: "Need", entityId: "n-1" };
    mocks.recordAudit.mockImplementation(() => {
      mocks.events.push("audit");
    });

    await adminAction(schema, "needs.edit", (_input, { audit }) => {
      mocks.events.push("handler");
      audit(entry);
      return Promise.resolve();
    })(input);

    expect(mocks.recordAudit).toHaveBeenCalledExactlyOnceWith(tx, owner, [
      entry,
    ]);
    expect(mocks.events).toEqual(["begin", "handler", "audit", "commit"]);
  });

  it("expires cache tags once, and only after the commit", async () => {
    await adminAction(schema, "needs.edit", (_input, { revalidate }) => {
      revalidate("need:1", "needs");
      revalidate("needs");
      return Promise.resolve();
    })(input);

    expect(mocks.events).toEqual([
      "begin",
      "commit",
      "updateTag:need:1",
      "updateTag:needs",
    ]);
  });

  it("turns an ActionError into a failure and rolls back", async () => {
    const result = await adminAction(schema, "needs.edit", (_i, context) => {
      context.audit({ action: "need.create", entity: "Need", entityId: "1" });
      context.revalidate("needs");
      throw new ActionError("Нужда уже закрыта: обновите страницу.");
    })(input);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "failed",
        message: "Нужда уже закрыта: обновите страницу.",
        fieldErrors: undefined,
      },
    });
    expect(mocks.events).toEqual(["begin", "rollback"]);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("points an ActionError with field errors at the fields", async () => {
    const result = await adminAction(schema, "needs.edit", () => {
      throw new ActionError("Проверьте название.", {
        title: "Нужда с таким названием уже есть.",
      });
    })(input);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Проверьте название.",
        fieldErrors: { title: "Нужда с таким названием уже есть." },
      },
    });
  });

  it("reports a permission the handler checks itself as forbidden", async () => {
    mocks.getStaffUser.mockResolvedValue(editor);

    const result = await adminAction(schema, "needs.edit", (_i, { user }) => {
      assertCan(user, "needs.publish");
      return Promise.resolve();
    })(input);

    expect(result).toEqual({
      ok: false,
      error: { code: "forbidden", message: ACTION_MESSAGES.forbidden },
    });
    expect(mocks.events).toEqual(["begin", "rollback"]);
  });

  it("refuses a redirect() from the handler instead of undoing the work silently", async () => {
    const action = adminAction(schema, "needs.edit", () => {
      // What redirect() of next/navigation throws.
      throw Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;push;/admin/needs/1;307;",
      });
    });

    await expect(action(input)).rejects.toThrow(
      /navigate in the form's onSuccess/,
    );
    expect(mocks.events).toEqual(["begin", "rollback"]);
  });

  it("lets an unexpected error through: it is a bug, not an answer", async () => {
    const action = adminAction(schema, "needs.edit", () => {
      throw new Error("connection lost");
    });

    await expect(action(input)).rejects.toThrow("connection lost");
    expect(mocks.events).toEqual(["begin", "rollback"]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
