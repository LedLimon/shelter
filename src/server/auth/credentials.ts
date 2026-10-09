// Sign-in credentials written outside the sign-in flow: by the seed (the
// owner's first password, a dev TOTP secret) and by test fixtures. Formats
// come from the same Better Auth instance that checks them at sign-in.
import { symmetricEncrypt } from "better-auth/crypto";
import type { Db } from "@/server/db/client";
import type { Auth } from "./config";

const CREDENTIAL_PROVIDER = "credential";

/**
 * Gives the user a password unless they already have one, so a seed run
 * never resets a password changed since. Returns whether it was set.
 */
export async function ensurePassword(
  auth: Auth,
  db: Db,
  userId: string,
  password: string,
): Promise<boolean> {
  const existing = await db.account.findUnique({
    where: {
      providerId_accountId: {
        providerId: CREDENTIAL_PROVIDER,
        accountId: userId,
      },
    },
  });
  if (existing?.password) return false;

  const hash = await (await auth.$context).password.hash(password);
  await db.account.upsert({
    where: {
      providerId_accountId: {
        providerId: CREDENTIAL_PROVIDER,
        accountId: userId,
      },
    },
    create: {
      userId,
      providerId: CREDENTIAL_PROVIDER,
      accountId: userId,
      password: hash,
    },
    update: { password: hash },
  });
  return true;
}

/**
 * Turns TOTP on with a known secret, as if the user had scanned it and
 * entered a code — unless they already have an authenticator. For dev and
 * tests only: a real secret must come from the setup screen. Backup codes
 * are left empty. Returns whether TOTP was set.
 */
export async function ensureTotp(
  auth: Auth,
  db: Db,
  userId: string,
  secret: string,
): Promise<boolean> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  if (user.twoFactorEnabled) return false;

  const { secretConfig } = await auth.$context;
  const data = {
    secret: await symmetricEncrypt({ key: secretConfig, data: secret }),
    backupCodes: await symmetricEncrypt({ key: secretConfig, data: "[]" }),
    verified: true,
    failedVerificationCount: 0,
    lockedUntil: null,
  };
  await db.twoFactor.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });
  return true;
}
