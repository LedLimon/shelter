import { describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth";
import { adminAccessOf } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { secretFromOtpauth, totp, wrongTotp } from "../support/totp";
import { Browser, createUser, nextIp, PASSWORD } from "./support/auth";

const TOTP_SECRET = "integration-totp-secret-0123456789";

async function signIn(browser: Browser, email: string, password = PASSWORD) {
  return browser.post("/sign-in/email", { email, password });
}

async function sessionsOf(userId: string) {
  return getDb().session.findMany({ where: { userId } });
}

describe("staff sign-in with TOTP", () => {
  it("asks for the code after the password and creates no session yet", async () => {
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });
    const browser = new Browser();

    const response = await signIn(browser, owner.email);

    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      twoFactorRedirect: true,
      twoFactorMethods: ["totp"],
    });
    expect(browser.has("session_token")).toBe(false);
    expect(await sessionsOf(owner.id)).toEqual([]);
    expect(adminAccessOf(await browser.session())).toEqual({
      status: "anonymous",
    });
  });

  it("lets staff into the admin after a valid code", async () => {
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });
    const browser = new Browser();
    await signIn(browser, owner.email);

    const response = await browser.post("/two-factor/verify-totp", {
      code: totp(TOTP_SECRET),
    });

    expect(response.status).toBe(200);
    const session = await browser.session();
    expect(session?.session.twoFactorVerified).toBe(true);
    expect(adminAccessOf(session)).toEqual({
      status: "granted",
      user: {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        role: "OWNER",
      },
    });
    // Ids come from the schema default (cuid2), not from Better Auth.
    const [stored] = await sessionsOf(owner.id);
    expect(stored?.id).toMatch(/^[a-z0-9]{24}$/);
  });

  it("rejects a wrong code and keeps the user out", async () => {
    const admin = await createUser({ role: "ADMIN", totpSecret: TOTP_SECRET });
    const browser = new Browser();
    await signIn(browser, admin.email);

    const response = await browser.post("/two-factor/verify-totp", {
      code: wrongTotp(TOTP_SECRET),
    });

    expect(response.status).toBe(401);
    expect(response.json.code).toBe("INVALID_CODE");
    expect(await sessionsOf(admin.id)).toEqual([]);
    expect(
      await getDb().twoFactor.findUniqueOrThrow({
        where: { userId: admin.id },
      }),
    ).toMatchObject({ failedVerificationCount: 1 });
  });

  it("locks the second factor after 10 wrong codes in a row", async () => {
    const admin = await createUser({ role: "ADMIN", totpSecret: TOTP_SECRET });
    const wrong = wrongTotp(TOTP_SECRET);

    // A challenge allows 5 attempts; the account lock counts across them.
    for (let challenge = 0; challenge < 2; challenge += 1) {
      const browser = new Browser();
      await signIn(browser, admin.email);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        // A new IP per request: this is about the account, not the IP limit.
        const response = await browser.post(
          "/two-factor/verify-totp",
          { code: wrong },
          { ip: nextIp() },
        );
        expect(response.status).toBe(401);
      }
    }

    const browser = new Browser();
    await signIn(browser, admin.email);
    const response = await browser.post("/two-factor/verify-totp", {
      code: totp(TOTP_SECRET),
    });

    expect(response.status).toBe(429);
    expect(response.json.code).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    expect(await sessionsOf(admin.id)).toEqual([]);
  });

  it("refuses to trust the device: TOTP is asked every time", async () => {
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });
    const browser = new Browser();
    await signIn(browser, owner.email);

    const response = await browser.post("/two-factor/verify-totp", {
      code: totp(TOTP_SECRET),
      trustDevice: true,
    });

    expect(response.status).toBe(400);
    expect(await sessionsOf(owner.id)).toEqual([]);
  });

  it("rejects a wrong password without telling whether the email exists", async () => {
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });

    const wrongPassword = await signIn(
      new Browser(),
      owner.email,
      "not the password",
    );
    const unknownEmail = await signIn(
      new Browser(),
      "nobody@shelter.localhost",
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.json.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(unknownEmail.json.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});

describe("first sign-in of staff without TOTP", () => {
  it("lets them only set up an authenticator, then into the admin", async () => {
    const editor = await createUser({ role: "EDITOR" });
    const browser = new Browser();

    const signedIn = await signIn(browser, editor.email);
    expect(signedIn.json.twoFactorRedirect).toBeUndefined();
    expect(adminAccessOf(await browser.session()).status).toBe(
      "needs-two-factor-setup",
    );

    const enabled = await browser.post("/two-factor/enable", {
      password: PASSWORD,
    });
    expect(enabled.status).toBe(200);
    const uri = String(enabled.json.totpURI);
    expect(uri).toMatch(/^otpauth:\/\/totp\/localhost%3A3000:/);
    expect(enabled.json.backupCodes).toHaveLength(10);
    // Until a code is entered, TOTP isn't on yet.
    expect(adminAccessOf(await browser.session()).status).toBe(
      "needs-two-factor-setup",
    );

    const secret = secretFromOtpauth(uri);
    const verified = await browser.post("/two-factor/verify-totp", {
      code: totp(secret),
    });

    expect(verified.status).toBe(200);
    expect(adminAccessOf(await browser.session()).status).toBe("granted");
    // The pre-TOTP session was replaced, not upgraded.
    const sessions = await sessionsOf(editor.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.twoFactorVerified).toBe(true);
  });

  it("requires the password to start the setup", async () => {
    const editor = await createUser({ role: "EDITOR" });
    const browser = new Browser();
    await signIn(browser, editor.email);

    const response = await browser.post("/two-factor/enable", {
      password: "not the password",
    });

    expect(response.status).toBe(400);
    expect(
      await getDb().twoFactor.findUnique({ where: { userId: editor.id } }),
    ).toBeNull();
  });
});

describe("sessions that skipped the second factor", () => {
  it("don't open the admin for staff who have TOTP", async () => {
    // As if a later sign-in method (donor email codes) created the session.
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });
    const { internalAdapter } = await getAuth().$context;

    const session = await internalAdapter.createSession(owner.id);

    const stored = await getDb().session.findUniqueOrThrow({
      where: { token: session.token },
    });
    expect(stored.twoFactorVerified).toBe(false);
    expect(
      adminAccessOf({
        session: stored,
        user: { ...owner, twoFactorEnabled: true },
      }).status,
    ).toBe("needs-two-factor");
  });

  it("are refused for deleted users", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await getDb().user.update({
      where: { id: admin.id },
      data: { deletedAt: new Date() },
    });

    const response = await signIn(new Browser(), admin.email);

    expect(response.status).toBe(401);
    expect(await sessionsOf(admin.id)).toEqual([]);
  });
});

describe("donors", () => {
  it("get a session but no admin (403)", async () => {
    const donor = await createUser({ role: "DONOR" });
    const browser = new Browser();

    await signIn(browser, donor.email);

    expect(adminAccessOf(await browser.session())).toEqual({
      status: "forbidden",
    });
  });
});

describe("rate limit", () => {
  it("allows 5 password attempts a minute per IP, kept in Postgres", async () => {
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });
    const browser = new Browser();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await signIn(browser, owner.email, "wrong password");
      expect(response.status).toBe(401);
    }
    const blocked = await signIn(browser, owner.email);

    expect(blocked.status).toBe(429);
    expect(
      await getDb().rateLimit.findUnique({
        where: { key: `${browser.ip}|/sign-in/email` },
      }),
    ).toMatchObject({ count: 5 });
    // Another IP is not affected.
    expect((await signIn(new Browser(nextIp()), owner.email)).status).toBe(200);
  });
});

describe("endpoints staff sign-in doesn't offer", () => {
  it.each([
    [
      "/sign-up/email",
      { email: "x@shelter.localhost", password: PASSWORD, name: "X" },
    ],
    ["/update-user", { name: "Другое имя" }],
    ["/two-factor/disable", { password: PASSWORD }],
    ["/two-factor/get-totp-uri", { password: PASSWORD }],
  ])("%s is not found", async (path, body) => {
    const response = await new Browser().post(path, body);

    expect(response.status).toBe(404);
  });

  it("rejects sign-in from another origin", async () => {
    const owner = await createUser({ role: "OWNER", totpSecret: TOTP_SECRET });

    const response = await new Browser().post(
      "/sign-in/email",
      { email: owner.email, password: PASSWORD },
      { origin: "https://evil.example" },
    );

    expect(response.status).toBe(403);
  });
});
