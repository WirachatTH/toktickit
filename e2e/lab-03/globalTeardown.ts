import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { E2E_EMAIL_PREFIX, E2E_TICKET_PREFIX } from "./helpers.js";

// The Lab 3 specs create real tickets (one per project, with an uploaded
// attachment) and real users through the actual app. Neither has a delete
// route (BR-36, BR-59), so — like the Lab 2 teardown beside it — this removes
// exactly the rows the specs created, by the prefixes they always use, after
// every project has finished. Tickets go first: their comments, notes,
// attachments, and history cascade with them. Then the users, whose sessions
// cascade; E2E users never own or author anything that would block that.
const UPLOADS_DIR = process.env.E2E_UPLOADS_DIR || "/server-uploads";

export default async function globalTeardown(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: tickets } = await client.query<{ id: number }>(`SELECT id FROM "Ticket" WHERE summary LIKE $1`, [`${E2E_TICKET_PREFIX}%`]);
    const ids = tickets.map((t) => t.id);
    let files = 0;
    if (ids.length > 0) {
      const { rows: attachments } = await client.query<{ storedFilename: string }>(
        `SELECT "storedFilename" FROM "Attachment" WHERE "ticketId" = ANY($1::int[])`,
        [ids],
      );
      await client.query(`DELETE FROM "Ticket" WHERE id = ANY($1::int[])`, [ids]);
      await Promise.all(attachments.map((a) => fs.unlink(path.join(UPLOADS_DIR, a.storedFilename)).catch(() => {})));
      files = attachments.length;
    }
    const { rowCount: users } = await client.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${E2E_EMAIL_PREFIX}%`]);
    console.log(`[e2e lab-03 teardown] deleted ${ids.length} ticket(s), ${files} attachment file(s), ${users ?? 0} user(s)`);
  } finally {
    await client.end();
  }
}
