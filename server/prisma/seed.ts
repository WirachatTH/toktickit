import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../src/prisma.js";

// Issue 3 — seed the four supported categories.
// The four names are: Account and Access, Hardware, Software, Network.
// Requirement: running the seed twice must NOT create duplicates.
// Hint: prisma.category.upsert({ where:{name}, update:{}, create:{name} }).
//
// Exported (rather than only run via main()) so tests can call it directly
// against the shared Prisma client and assert idempotency without shelling
// out to this file as a subprocess.
export async function seed(prisma: PrismaClient) {

  const categories = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network"
  ];

  console.log("Seeding categories...");
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`Upserted category: ${name}`);
  }

  // ---------------------------------------------------------------------
  // Lab 2, Issue 2 — seed Related Systems and Development Requesters.
  // Both upsert on a unique field so re-running this script never creates
  // duplicates (docs/lab-02/specification.md §5.3).
  // ---------------------------------------------------------------------

  const relatedSystems = [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ];

  console.log("Seeding related systems...");
  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    });
    console.log(`Upserted related system: ${name}`);
  }

  // At least 4 active + 1 inactive Development Requester is required.
  // The inactive Requester (isActive: false) must never appear in the
  // Development Requester Selector (BR-06, BR-41).
  const requesters: { name: string; email: string; isActive: boolean }[] = [
    { name: "Somchai Prasert", email: "somchai.prasert@kmutt.ac.th", isActive: true },
    { name: "Napassorn Chaiyasit", email: "napassorn.chaiyasit@kmutt.ac.th", isActive: true },
    { name: "Teerapat Wongsawat", email: "teerapat.wongsawat@kmutt.ac.th", isActive: true },
    { name: "Kanyarat Suksawang", email: "kanyarat.suksawang@kmutt.ac.th", isActive: true },
    { name: "Piyawat Chatchai", email: "piyawat.chatchai@kmutt.ac.th", isActive: true },
    { name: "Ananya Ruangrit", email: "ananya.ruangrit@kmutt.ac.th", isActive: false },
  ];

  console.log("Seeding development requesters...");
  for (const { name, email, isActive } of requesters) {
    // No-op update, matching Category/RelatedSystem above: seeding only
    // ensures these rows exist. It must never silently overwrite a row a
    // later feature (or a manual test tweak) has since changed.
    await prisma.requesterUser.upsert({
      where: { email },
      update: {},
      create: { name, email, isActive },
    });
    console.log(`Upserted requester: ${name} (${isActive ? "active" : "inactive"})`);
  }

  console.log("Seeding complete.");
}

async function main() {
  await seed(getPrisma());
}

// Only run when this file is executed directly (`tsx prisma/seed.ts` /
// `npm run prisma:seed`), never as a side effect of being imported — tests
// import { seed } to call it explicitly against the shared Prisma client,
// and an unguarded top-level call here would both reseed and disconnect
// that shared client the moment the module loads.
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
