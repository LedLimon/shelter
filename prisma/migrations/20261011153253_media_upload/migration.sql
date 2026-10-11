-- "byteSize" is added without a default: nothing has written to "Media" before
-- this migration (uploads appear with it), so the table is empty everywhere.
-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'UPLOADED', 'READY', 'FAILED');

-- DropIndex
DROP INDEX "Media_uploadedById_idx";

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "byteSize" INTEGER NOT NULL,
ADD COLUMN     "failure" TEXT,
ADD COLUMN     "status" "MediaStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Media_uploadedById_createdAt_idx" ON "Media"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "Media_status_createdAt_idx" ON "Media"("status", "createdAt");
