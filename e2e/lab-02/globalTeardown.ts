import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";

// The Issue 9 journey test creates a real ticket (with a real uploaded
// attachment) through the actual app, once per project (desktop/tablet/
// mobile) — there's no app-level "delete a ticket" route to clean up
// through (requesters can only soft-remove an attachment, per BR-36), so
// this connects directly to the same Postgres instance the `server`
// service uses and deletes by the summary this spec always writes,
// mirroring how the Vitest suites' own afterAll hooks clean up real rows
// and real files rather than leaving them in the shared dev environment.
// Runs once after every project finishes (not per-project), so all three
// runs' tickets are swept in one pass.
const UPLOADS_DIR = process.env.E2E_UPLOADS_DIR || "/server-uploads";

export default async function globalTeardown(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: tickets } = await client.query<{ id: number }>(
      `SELECT id FROM "Ticket" WHERE summary LIKE 'E2E flow ticket %'`,
    );
    if (tickets.length === 0) return;

    const ids = tickets.map((t) => t.id);
    const { rows: attachments } = await client.query<{ storedFilename: string }>(
      `SELECT "storedFilename" FROM "Attachment" WHERE "ticketId" = ANY($1::int[])`,
      [ids],
    );

    // Attachment rows cascade-delete with their Ticket (schema.prisma:
    // onDelete: Cascade) — only the on-disk files need a separate unlink.
    await client.query(`DELETE FROM "Ticket" WHERE id = ANY($1::int[])`, [ids]);
    await Promise.all(
      attachments.map((a) => fs.unlink(path.join(UPLOADS_DIR, a.storedFilename)).catch(() => {})),
    );

    console.log(
      `[e2e globalTeardown] deleted ${ids.length} ticket(s), ${attachments.length} attachment file(s)`,
    );
  } finally {
    await client.end();
  }
}
