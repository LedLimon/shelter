// Global setup of the integration project, next to ./postgres.ts: one MinIO
// container per run, the S3 API the media tests upload to. Each test file
// uses a bucket of its own (./database.ts names it, the media helpers create
// it).
import { GenericContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

// Same as docker-compose.yml, credentials included (.env.example has them).
const IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";
const PORT = 9000;

declare module "vitest" {
  export interface ProvidedContext {
    /** Endpoint of the run's MinIO: http://host:port. */
    s3Endpoint: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new GenericContainer(IMAGE)
    .withCommand(["server", "/data"])
    .withEnvironment({
      MINIO_ROOT_USER: "shelter",
      MINIO_ROOT_PASSWORD: "shelter-dev-secret",
      MINIO_SITE_REGION: "ru-central1",
    })
    // Throwaway data.
    .withTmpFs({ "/data": "rw" })
    .withExposedPorts(PORT)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", PORT))
    .start();

  project.provide(
    "s3Endpoint",
    `http://${container.getHost()}:${container.getMappedPort(PORT)}`,
  );

  return async () => {
    await container.stop();
  };
}
