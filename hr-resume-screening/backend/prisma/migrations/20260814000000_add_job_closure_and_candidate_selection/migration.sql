-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "selectedAt" TIMESTAMP(3),
ADD COLUMN     "selectedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedByUserId" TEXT,
ADD COLUMN     "selectedCandidateId" TEXT,
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "Candidate_jobId_hrStatus_idx" ON "Candidate"("jobId", "hrStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Job_selectedCandidateId_key" ON "Job"("selectedCandidateId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_status_closedAt_idx" ON "Job"("status", "closedAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_selectedCandidateId_fkey" FOREIGN KEY ("selectedCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_selectedByUserId_fkey" FOREIGN KEY ("selectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

