-- Lab 4 — Actions Taken, their history, and Ticket.resolvedAt
-- (docs/lab-04/specification.md §7.5). Generated with
-- `prisma migrate dev --create-only`, then hand-edited for two things Prisma
-- cannot express: the CHECK constraints (§7.3) and the resolvedAt backfill
-- (BR-47). Every statement adds; no Lab 1–3 row or column is changed except
-- the new resolvedAt. Rollback: prisma/rollback/lab4_down.sql.

-- CreateEnum
CREATE TYPE "ActionTakenStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionTakenEventType" AS ENUM ('CREATED', 'UPDATED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "result" VARCHAR(2000),
    "status" "ActionTakenStatus" NOT NULL DEFAULT 'PLANNED',
    "assigneeId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "performedById" INTEGER,
    "cancelledById" INTEGER,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" VARCHAR(1000),
    "attachmentNotes" VARCHAR(1000),
    "followUpOfId" INTEGER,
    "cancelReason" VARCHAR(1000),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "clientRequestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTakenEvent" (
    "id" SERIAL NOT NULL,
    "actionTakenId" INTEGER NOT NULL,
    "type" "ActionTakenEventType" NOT NULL,
    "actorId" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionTakenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_status_idx" ON "ActionTaken"("ticketId", "status");

-- CreateIndex
CREATE INDEX "ActionTaken_assigneeId_status_actionAt_idx" ON "ActionTaken"("assigneeId", "status", "actionAt");

-- CreateIndex
CREATE INDEX "ActionTaken_followUpOfId_idx" ON "ActionTaken"("followUpOfId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_createdById_clientRequestId_key" ON "ActionTaken"("createdById", "clientRequestId");

-- CreateIndex
CREATE INDEX "ActionTakenEvent_actionTakenId_createdAt_id_idx" ON "ActionTakenEvent"("actionTakenId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_currentStatus_idx" ON "Ticket"("requesterId", "currentStatus");

-- CreateIndex
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");

-- CreateIndex
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_followUpOfId_fkey" FOREIGN KEY ("followUpOfId") REFERENCES "ActionTaken"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenEvent" ADD CONSTRAINT "ActionTakenEvent_actionTakenId_fkey" FOREIGN KEY ("actionTakenId") REFERENCES "ActionTaken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenEvent" ADD CONSTRAINT "ActionTakenEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-edited: the database backs up BR-04, BR-11, BR-12, and BR-25 (§7.3).
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_version_check" CHECK ("version" >= 1);
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_followUpNote_check" CHECK (NOT "followUpRequired" OR "followUpNote" IS NOT NULL);
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_completed_check" CHECK ("status" <> 'COMPLETED' OR ("result" IS NOT NULL AND "performedById" IS NOT NULL));
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_cancelled_check" CHECK ("status" <> 'CANCELLED' OR "cancelReason" IS NOT NULL);

-- Hand-edited: BR-47 — the best timestamp the Lab 3 schema holds for when a
-- ticket was resolved (D-04). A plain UPDATE, so updatedAt itself is untouched.
UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus" IN ('RESOLVED', 'CLOSED');
