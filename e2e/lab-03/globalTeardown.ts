import { E2E_EMAIL_PREFIX, E2E_TICKET_PREFIX } from "./helpers.js";
import { removeE2EData } from "./cleanup.js";

// The backstop after every project has finished: each spec file already
// removes its own rows when it ends (cleanup.ts), and this sweeps anything a
// failed or interrupted run left behind, by the broad Lab 3 prefixes.
export default async function globalTeardown(): Promise<void> {
  const { tickets, files, users } = await removeE2EData({ ticketPrefix: E2E_TICKET_PREFIX, emailPrefix: E2E_EMAIL_PREFIX });
  console.log(`[e2e lab-03 teardown] deleted ${tickets} ticket(s), ${files} attachment file(s), ${users} user(s)`);
}
