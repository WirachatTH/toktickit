-- Lab 3 — users, roles, sessions, ticket workflow fields, comments, notes.
--
-- HAND-WRITTEN (docs/lab-03/specification.md §7.5, D-05). Do not regenerate it
-- with `prisma migrate dev`: Prisma has no rename detection and would turn the
-- RequesterUser -> User and RequestedPriority -> Priority renames into
-- DROP + CREATE, deleting every Lab 2 Requester and every ticket's Requested
-- Priority. Every statement below is a rename, an addition, or a backfill, so
-- no Lab 2 row is destroyed. Object names match what Prisma generates for the
-- Lab 3 schema, so `prisma migrate diff` against schema.prisma reports no drift
-- (MIG-05).


-- ---------------------------------------------------------------------------
-- Step 1 — rename RequesterUser to User in place (BR-72)
-- ---------------------------------------------------------------------------

-- Every row and id survives. Ticket_requesterId_fkey follows the rename by
-- itself, because PostgreSQL references tables by OID, not by name.
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- Lab 2's selector index. The Lab 3 schema replaces it with User(role, isActive).
DROP INDEX "RequesterUser_isActive_idx";


-- ---------------------------------------------------------------------------
-- Step 2 — rename the priority enum (it now serves IT Priority too, BR-35)
-- ---------------------------------------------------------------------------

-- Ticket.requestedPriority keeps every value; the column follows the type.
ALTER TYPE "RequestedPriority" RENAME TO "Priority";


-- ---------------------------------------------------------------------------
-- Step 3 — User columns (BR-20, BR-73, D-07)
-- ---------------------------------------------------------------------------

CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

-- Every new column is nullable or has a default, because the table already
-- holds the Lab 2 Requesters. The defaults make each migrated row a REQUESTER
-- that must change its password and has no hash: locked until a password is
-- assigned (BR-10, BR-73).
ALTER TABLE "User"
    ADD COLUMN "passwordHash" TEXT,
    ADD COLUMN "role" "Role" NOT NULL DEFAULT 'REQUESTER',
    ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "lastLoginAt" TIMESTAMP(3),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The default above only fills the existing rows. Prisma's @updatedAt columns
-- carry no database default (compare Lab 2's Ticket."updatedAt"), so it is
-- dropped again, or MIG-05 would report drift.
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");


-- ---------------------------------------------------------------------------
-- Step 4 — normalise migrated emails (BR-09, BR-75)
-- ---------------------------------------------------------------------------

-- If two Lab 2 emails differed only by case or surrounding spaces, this
-- violates User_email_key and the whole migration fails rather than silently
-- merging two accounts.
UPDATE "User" SET "email" = lower(trim("email"));


-- ---------------------------------------------------------------------------
-- Step 5 — widen the status lifecycle (BR-38)
-- ---------------------------------------------------------------------------

-- Appended in lifecycle order, which is also the order the queue sorts by.
-- None of these values is used later in this file, so PostgreSQL's rule that
-- a freshly added enum value cannot be used in the same transaction never
-- applies.
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';


-- ---------------------------------------------------------------------------
-- Step 6 — Ticket workflow columns and the IT Priority backfill (BR-28, BR-34, BR-77)
-- ---------------------------------------------------------------------------

-- itPriority starts nullable so the ADD COLUMN cannot fail on existing rows,
-- is backfilled from the Requester's own priority, and only then becomes
-- NOT NULL. If any row were missed, SET NOT NULL fails and the migration
-- rolls back rather than leaving a ticket without an IT Priority.
ALTER TABLE "Ticket"
    ADD COLUMN "ownerId" INTEGER,
    ADD COLUMN "itPriority" "Priority",
    ADD COLUMN "requesterResolvedAt" TIMESTAMP(3),
    ADD COLUMN "resolutionSummary" VARCHAR(2000);

UPDATE "Ticket" SET "itPriority" = "requestedPriority";

ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");
CREATE INDEX "Ticket_currentStatus_itPriority_createdAt_idx" ON "Ticket"("currentStatus", "itPriority", "createdAt");

-- Restrict: users are deactivated, never deleted (BR-59).
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Step 7 — sessions, Public Comments, Internal Notes (D-01, D-02, D-04)
-- ---------------------------------------------------------------------------

CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Two tables rather than one with a visibility flag (BR-49).
CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicComment_ticketId_createdAt_idx" ON "PublicComment"("ticketId", "createdAt");

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InternalNote_ticketId_createdAt_idx" ON "InternalNote"("ticketId", "createdAt");

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 8 (verification) is not SQL: MIG-05 applies every migration to a
-- throwaway schema and diffs it against schema.prisma.
