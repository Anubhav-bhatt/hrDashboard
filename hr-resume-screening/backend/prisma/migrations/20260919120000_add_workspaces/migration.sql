-- Workspaces: the tenant boundary that makes public signup safe.
--
-- Before this migration every authenticated user could see every job and every
-- candidate. Opening signup without an owner on those records would hand each
-- new account the whole database.
--
-- Prisma's generated DDL adds `workspaceId ... NOT NULL` in one step, which
-- fails on any table that already has rows. This migration does it in the three
-- steps a populated table needs — add nullable, backfill, then constrain — so
-- existing jobs, candidates and history are preserved rather than dropped.
--
-- Guarded throughout so it can be applied, re-applied or baselined without a
-- manual database edit.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- The workspace that inherits everything that existed before tenancy.
--
-- A fixed id rather than a generated one, so this migration is deterministic and
-- the same row can be referred to by later steps and by operators.
INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Existing Recruitment Workspace', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Every account that existed before signup becomes an owner of that workspace.
-- They shared this data already; this records the access they in fact had rather
-- than granting anything new, and it deliberately does not hand it to any account
-- created later through public signup.
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT
    md5('ws-seed-' || "User"."id")::uuid::text,
    '00000000-0000-4000-8000-000000000001',
    "User"."id",
    'OWNER',
    CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

/* ------------------------------------------------------------------ Job --- */

-- Step 1: add nullable, so a populated table is not rejected.
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

-- Step 2: backfill every pre-existing job into the inherited workspace.
UPDATE "Job" SET "workspaceId" = '00000000-0000-4000-8000-000000000001' WHERE "workspaceId" IS NULL;

-- Step 3: only now can the column be required.
ALTER TABLE "Job" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Job_workspaceId_idx" ON "Job"("workspaceId");
CREATE INDEX IF NOT EXISTS "Job_workspaceId_status_idx" ON "Job"("workspaceId", "status");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

/* ---------------------------------------------------- OutlookConnection --- */

ALTER TABLE "OutlookConnection" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

UPDATE "OutlookConnection" SET "workspaceId" = '00000000-0000-4000-8000-000000000001' WHERE "workspaceId" IS NULL;

ALTER TABLE "OutlookConnection" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OutlookConnection_workspaceId_idx" ON "OutlookConnection"("workspaceId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "OutlookConnection" ADD CONSTRAINT "OutlookConnection_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

/* -------------------------------------------------- WorkspaceMember FKs --- */

DO $$ BEGIN
    ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
