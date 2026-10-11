// Talks to Better Auth the way the browser does — HTTP requests through the
// route handler — so rate limits, the origin check and disabled paths apply.
import type { UserRole } from "@/generated/prisma/enums";
import { getAuth } from "@/server/auth";
import { ensurePassword, ensureTotp } from "@/server/auth/credentials";
import { getDb } from "@/server/db";

/** APP_URL of .env.example, which the test setup loads. */
export const ORIGIN = "http://localhost:3000";

let ipCounter = 0;

/** A fresh client IP, so a test starts with empty rate-limit buckets. */
export function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

/** Cookies of one browser: sent with every request, updated from responses. */
export class Browser {
  private readonly cookies = new Map<string, string>();

  constructor(readonly ip: string = nextIp()) {}

  get cookieHeader(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  has(name: string): boolean {
    return [...this.cookies.keys()].some((cookie) => cookie.endsWith(name));
  }

  async post(
    path: string,
    body: unknown,
    { origin = ORIGIN, ip = this.ip }: { origin?: string; ip?: string } = {},
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const response = await getAuth().handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "x-forwarded-for": ip,
          ...(this.cookies.size > 0 ? { cookie: this.cookieHeader } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = header.split(";");
      const [name = "", value = ""] = pair.split("=");
      const expired = attributes.some((attribute) =>
        /^\s*max-age=0\s*$/i.test(attribute),
      );
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const json = isJson
      ? ((await response.json()) as Record<string, unknown> | null)
      : null;
    return { status: response.status, json: json ?? {} };
  }

  /** The session as the admin layout sees it. */
  async session() {
    return getAuth().api.getSession({
      headers: new Headers({ cookie: this.cookieHeader }),
    });
  }
}

let userCounter = 0;

export const PASSWORD = "correct horse battery";

/** A user with a password and, if `totpSecret` is given, TOTP turned on. */
export async function createUser({
  role,
  totpSecret,
}: {
  role: UserRole;
  totpSecret?: string;
}) {
  userCounter += 1;
  const user = await getDb().user.create({
    data: {
      email: `user-${userCounter}@shelter.localhost`,
      name: `Пользователь ${userCounter}`,
      emailVerified: true,
      role,
    },
  });
  await ensurePassword(getAuth(), getDb(), user.id, PASSWORD);
  if (totpSecret) await ensureTotp(getAuth(), getDb(), user.id, totpSecret);
  return user;
}
