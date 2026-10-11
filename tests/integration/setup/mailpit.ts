// Global setup of the integration project, next to ./postgres.ts: one Mailpit
// container per run. ./database.ts points SMTP_HOST and SMTP_PORT of every
// test file at it, so no letter of a test reaches a real server or the
// Mailpit of `pnpm dev:up`. Tests read it through tests/helpers/mailpit.ts.
import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

// Same as docker-compose.yml.
const IMAGE = "axllent/mailpit:v1.31.4";
const SMTP_PORT = 1025;
const API_PORT = 8025;

declare module "vitest" {
  export interface ProvidedContext {
    mailpit: { smtpHost: string; smtpPort: number; apiUrl: string };
  }
}

export default async function setup(project: TestProject) {
  const container = await new GenericContainer(IMAGE)
    .withExposedPorts(SMTP_PORT, API_PORT)
    .withWaitStrategy(Wait.forHttp("/readyz", API_PORT))
    .start()
    .catch((error: unknown) => {
      throw new Error(
        "Integration tests start Mailpit in Docker: is Docker running? " +
          "Unit tests alone: pnpm test:unit.",
        { cause: error },
      );
    });

  const host = container.getHost();
  project.provide("mailpit", {
    smtpHost: host,
    smtpPort: container.getMappedPort(SMTP_PORT),
    apiUrl: `http://${host}:${container.getMappedPort(API_PORT)}`,
  });

  return async () => {
    await container.stop();
  };
}
