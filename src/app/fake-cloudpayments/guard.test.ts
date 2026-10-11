import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCloudPayments } from "@/server/payments/cloudpayments";
import {
  createFakeCloudPayments,
  createFakeState,
  type FakeState,
} from "@/server/payments/fake";
import type { PaymentProvider } from "@/server/payments/types";

// The emulator "charges" without money. Its pages and server actions are
// each reachable on their own, so each must answer 404 unless the provider
// is the emulator and the request came to this machine.

const request = vi.hoisted(
  (): {
    provider: unknown;
    headers: Record<string, string>;
  } => ({ provider: undefined, headers: {} }),
);

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(request.headers)),
}));
vi.mock("@/server/payments", () => ({
  getPaymentProvider: () => request.provider,
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));

const { requireFakeCloudPayments } = await import("./guard");
const actions = await import("./actions");
const { default: StartPage, generateMetadata: startMetadata } =
  await import("./page");
const { default: CheckoutPage, generateMetadata: checkoutMetadata } =
  await import("./checkout/[id]/page");

const LOCAL = { host: "localhost:3000" };

let state: FakeState;

function withFake(headers: Record<string, string> = LOCAL) {
  state = createFakeState();
  // Nothing may be delivered in these tests.
  state.deliver = () => Promise.reject(new Error("must not be delivered"));
  const fake = createFakeCloudPayments({
    appUrl: "http://localhost:3000",
    state,
  });
  request.provider = fake;
  request.headers = headers;
  return fake;
}

function withCloudPayments(): PaymentProvider {
  const provider = createCloudPayments({
    publicId: "pk_live",
    apiSecret: "live-api-secret",
    acceptTestPayments: false,
  });
  request.provider = provider;
  request.headers = LOCAL;
  return provider;
}

/** Next's notFound() and redirect() throw errors with these digests. */
async function digestOf(run: () => unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error && "digest" in error) {
      return String(error.digest);
    }
    throw error;
  }
  return "returned";
}

const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

const checkoutProps = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as Parameters<typeof CheckoutPage>[0];

/** Every way in: pages, their metadata, server actions. */
const ENTRY_POINTS: [string, (checkoutId: string) => unknown][] = [
  ["the guard", () => requireFakeCloudPayments()],
  ["the start page", () => StartPage()],
  ["the start page's metadata", () => startMetadata()],
  ["the checkout page", (id) => CheckoutPage(checkoutProps(id))],
  ["the checkout page's metadata", (id) => checkoutMetadata(checkoutProps(id))],
  [
    "startTestPayment",
    () =>
      actions.startTestPayment({
        amountKop: 50_000,
        email: "donor@shelter.localhost",
        monthly: false,
      }),
  ],
  [
    "payFakeCheckout",
    (checkoutId) =>
      actions.payFakeCheckout(form({ checkoutId, outcome: "success" })),
  ],
  [
    "completeFake3ds",
    (checkoutId) =>
      actions.completeFake3ds(form({ checkoutId, result: "passed" })),
  ],
  [
    "cancelFakeCheckout",
    (checkoutId) => actions.cancelFakeCheckout(form({ checkoutId })),
  ],
  [
    "retryFakeCheckout",
    (checkoutId) => actions.retryFakeCheckout(form({ checkoutId })),
  ],
];

const INTENT = {
  invoiceId: "invoice-1",
  amountKop: 50_000,
  description: "Пожертвование",
  email: "donor@shelter.localhost",
  metadata: {},
  returnUrl: "http://localhost:3000/donate/status/invoice-1",
};

function openCheckout(fake: ReturnType<typeof withFake>): string {
  const launch = fake.widgetParams(INTENT);
  if (launch.kind !== "redirect") throw new Error("expected a redirect");
  return launch.url.split("/").at(-1)!;
}

beforeEach(() => {
  request.provider = undefined;
  request.headers = {};
});

describe("with a real provider", () => {
  it.each(ENTRY_POINTS)("%s answers 404", async (_name, enter) => {
    withCloudPayments();

    expect(await digestOf(() => enter("any-checkout"))).toBe(NOT_FOUND);
  });
});

describe("with the emulator, asked for under a public host name", () => {
  // A server behind a proxy whose APP_URL was left at localhost.
  it.each([
    ["the Host header", { host: "priyut.example" }],
    [
      "a forwarded host",
      { host: "localhost:3000", "x-forwarded-host": "priyut.example" },
    ],
    ["a host that only looks local", { host: "localhost.priyut.example" }],
    ["a LAN address", { host: "192.168.1.10:3000" }],
    ["no host at all", {}],
  ])("answers 404 by %s", async (_what, headers) => {
    for (const [, enter] of ENTRY_POINTS) {
      const fake = withFake();
      const id = openCheckout(fake);
      request.headers = headers;

      expect(await digestOf(() => enter(id))).toBe(NOT_FOUND);
      // …and nothing happened to the payment.
      expect(fake.getCheckout(id)).toMatchObject({
        status: "open",
        deliveries: [],
      });
      expect(state.checkouts.size).toBe(1);
    }
  });
});

describe("with the emulator, on this machine", () => {
  it.each<Record<string, string>>([
    { host: "localhost:3000" },
    { host: "127.0.0.1:3100" },
    { host: "[::1]:3000" },
    {
      host: "shelter.localhost:3000",
      "x-forwarded-host": "shelter.localhost:3000",
    },
  ])("lets $host in", async (headers) => {
    const fake = withFake(headers);

    await expect(requireFakeCloudPayments()).resolves.toBe(fake);
  });

  it("starts a test payment and gives the widget's address", async () => {
    const fake = withFake();

    const result = await actions.startTestPayment({
      amountKop: 150_050,
      email: "donor@shelter.localhost",
      monthly: true,
    });

    if (!("url" in result)) throw new Error("expected a url");
    const checkout = fake.getCheckout(result.url.split("/").at(-1)!)!;
    expect(result.url).toMatch(/^\/fake-cloudpayments\/checkout\/[\w-]{22}$/);
    expect(checkout.intent).toMatchObject({
      amountKop: 150_050,
      email: "donor@shelter.localhost",
      recurrent: { interval: "MONTH", period: 1 },
      returnUrl: "http://localhost:3000/fake-cloudpayments",
    });
    // The payer's id is opaque: not the email.
    expect(checkout.intent.accountId).toMatch(/^test-payer-[0-9a-f]{16}$/);
  });

  it.each([
    { amountKop: 0 },
    { amountKop: 100.5 },
    { amountKop: 2_147_483_648 },
    { email: "donor" },
  ])("starts nothing for $amountKop $email", async (change) => {
    withFake();

    const result = await actions.startTestPayment({
      amountKop: 50_000,
      email: "donor@shelter.localhost",
      monthly: false,
      ...change,
    });

    expect(result).toEqual({ error: "invalid" });
    expect(state.checkouts.size).toBe(0);
  });

  it("answers 404 to a form it didn't render", async () => {
    const fake = withFake();
    const checkoutId = openCheckout(fake);

    for (const run of [
      () => actions.payFakeCheckout(form({ checkoutId, outcome: "refund" })),
      () => actions.payFakeCheckout(form({ outcome: "success" })),
      () => actions.completeFake3ds(form({ checkoutId, result: "maybe" })),
      () => actions.cancelFakeCheckout(form({})),
      () => actions.retryFakeCheckout(form({ checkoutId: "x".repeat(65) })),
    ]) {
      expect(await digestOf(run)).toBe(NOT_FOUND);
    }
    expect(fake.getCheckout(checkoutId)!.status).toBe("open");
  });

  it("closes a checkout and returns to its page", async () => {
    const fake = withFake();
    const checkoutId = openCheckout(fake);

    const digest = await digestOf(() =>
      actions.cancelFakeCheckout(form({ checkoutId })),
    );

    expect(digest).toContain(`/fake-cloudpayments/checkout/${checkoutId}`);
    expect(digest).toMatch(/^NEXT_REDIRECT;/);
    expect(fake.getCheckout(checkoutId)!.status).toBe("cancelled");
  });
});
