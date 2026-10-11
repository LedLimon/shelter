-- Outbox."availableAt" is compared with the database's now() by the outbox
-- dispatcher (src/server/jobs/outbox), so it has to come from the same clock:
-- Prisma computes @default(now()) in the application. In SQL the default was
-- already the database's time; this only makes the schema say so, and Prisma
-- Client stops sending its own value. To roll back:
--   ALTER TABLE "Outbox" ALTER COLUMN "availableAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Outbox" ALTER COLUMN "availableAt" SET DEFAULT transaction_timestamp();
