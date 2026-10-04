import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";

// Removes rows the Lab 3 specs created through the real app. Neither tickets
// nor users have a delete route (BR-36, BR-59), so this goes straight to the
// database, by the prefixes the specs always use:
// - tickets whose summary starts with `ticketPrefix`, with their attachment
//   files (comments, notes, attachments, and history cascade with the ticket);
// - users whose email starts with `emailPrefix` (their sessions cascade; E2E
//   users never own or author anything that would block the delete).
// Each spec file calls it when it finishes, for its own prefix, so the next
// file — and its screenshots — start from the seeded data only (PR #61 review).
// The global teardown calls it once more with the broad prefixes, as a backstop.
const UPLOADS_DIR = process.env.E2E_UPLOADS_DIR || "/server-uploads";

export async function removeE2EData(opts: { ticketPrefix?: string; emailPrefix?: string }): Promise<{ tickets: number; files: number; users: number }> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    let ids: number[] = [];
    let files = 0;
    if (opts.ticketPrefix) {
      const { rows } = await client.query<{ id: number }>(`SELECT id FROM "Ticket" WHERE summary LIKE $1`, [`${opts.ticketPrefix}%`]);
      ids = rows.map((t) => t.id);
      if (ids.length > 0) {
        const { rows: attachments } = await client.query<{ storedFilename: string }>(
          `SELECT "storedFilename" FROM "Attachment" WHERE "ticketId" = ANY($1::int[])`,
          [ids],
        );
        await client.query(`DELETE FROM "Ticket" WHERE id = ANY($1::int[])`, [ids]);
        await Promise.all(attachments.map((a) => fs.unlink(path.join(UPLOADS_DIR, a.storedFilename)).catch(() => {})));
        files = attachments.length;
      }
    }
    let users = 0;
    if (opts.emailPrefix) {
      const { rowCount } = await client.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${opts.emailPrefix}%`]);
      users = rowCount ?? 0;
    }
    return { tickets: ids.length, files, users };
  } finally {
    await client.end();
  }
}
