import { E2E4_EMAIL_PREFIX, E2E4_TICKET_PREFIX } from "./helpers.js";
import { removeE2EData } from "../lab-03/cleanup.js";

// The backstop after every project has finished: each Lab 4 spec file removes
// its own tickets and users when it ends, and this sweeps anything a failed or
// interrupted run left behind. Actions Taken and their history go with their
// ticket (ON DELETE CASCADE), so tickets are removed before users.
export default async function globalTeardown(): Promise<void> {
  const { tickets, files, users } = await removeE2EData({ ticketPrefix: E2E4_TICKET_PREFIX, emailPrefix: E2E4_EMAIL_PREFIX });
  console.log(`[e2e lab-04 teardown] deleted ${tickets} ticket(s), ${files} attachment file(s), ${users} user(s)`);
}
