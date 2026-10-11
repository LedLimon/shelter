// The real worker process sending a real letter: tsx compiling the JSX of the
// templates under the worker's tsconfig, the SMTP client made from the
// environment. The in-process tests of ./send.test.ts share neither.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { getDb } from "@/server/db";
import { outbox } from "@/server/jobs";
import { uniqueAddress, waitForInbox } from "../../helpers/mailpit";
import { plain } from "../../helpers/text";
import { eventually, outboxRow } from "../jobs/helpers";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

it("pnpm worker sends the letter of an outbox event", async () => {
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      ...["--tsconfig", "tsconfig.worker.json"],
      "worker/index.ts",
    ],
    // The setup file has pointed DATABASE_URL and SMTP_* at this run's services.
    { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = once(child, "exit") as Promise<[number | null, string]>;

  try {
    await eventually(() => {
      expect(output).toContain("[worker] started");
    });
    const address = uniqueAddress("owner");
    const user = await getDb().user.create({
      data: { email: address, name: "Владелец", role: "OWNER" },
    });
    const eventId = (await outbox.enqueue(getDb(), "email.test", {
      template: "donation.thanks",
      example: "need",
      userId: user.id,
    }))!;

    const [letter] = await waitForInbox(address);
    expect(plain(letter!.subject)).toBe(
      "Проверка: Спасибо! Мы получили ваше пожертвование — 1 500 ₽",
    );
    expect(letter!.html).toContain("Корм на октябрь");
    await eventually(async () => {
      expect(await outboxRow(eventId)).toMatchObject({ status: "PROCESSED" });
    });

    child.kill("SIGTERM");
    const [code] = await exited;

    expect(code, output).toBe(0);
    expect(output).toContain(
      `[outbox] email.test ${eventId}: done (attempt 1)`,
    );
    expect(output).not.toContain(address);
  } finally {
    child.kill("SIGKILL");
  }
});
