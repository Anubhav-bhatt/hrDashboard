-- PlatformActivity & Job attribution migration
--
-- Adds:
-- 1. Job.createdByUserId (nullable, set null on delete) to attribute who created a job.
-- 2. PlatformActivity table with indexes for platform-wide audit and activity visibility.
--
-- Completely backwards-compatible with all existing records.

-- AlterTable Job
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

-- Job foreign key for createdByUserId
DO $$ BEGIN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable PlatformActivity
CREATE TABLE IF NOT EXISTS "PlatformActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'System',
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityName" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformActivity_userId_createdAt_idx" ON "PlatformActivity"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformActivity_action_createdAt_idx" ON "PlatformActivity"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformActivity_createdAt_idx" ON "PlatformActivity"("createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "PlatformActivity" ADD CONSTRAINT "PlatformActivity_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
