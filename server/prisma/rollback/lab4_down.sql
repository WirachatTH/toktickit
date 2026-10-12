-- Lab 4 rollback (docs/lab-04/specification.md §7.5). Returns the schema to
-- exactly Lab 3 by removing everything lab4_actions_taken_dashboards added.
-- The migration only added, so no Lab 1–3 row is lost; Actions Taken and their
-- history are dropped. Take a pg_dump backup first if they matter.
--
-- Apply with: npx prisma db execute --file prisma/rollback/lab4_down.sql --schema prisma/schema.prisma

DROP TABLE IF EXISTS "ActionTakenEvent";
DROP TABLE IF EXISTS "ActionTaken";
DROP TYPE IF EXISTS "ActionTakenEventType";
DROP TYPE IF EXISTS "ActionTakenStatus";
DROP INDEX IF EXISTS "Ticket_requesterId_currentStatus_idx";
DROP INDEX IF EXISTS "Ticket_updatedAt_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";

-- Forget the migration, so `prisma migrate deploy` would apply it again.
DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    DELETE FROM "_prisma_migrations" WHERE "migration_name" LIKE '%_lab4_actions_taken_dashboards';
  END IF;
END $$;
