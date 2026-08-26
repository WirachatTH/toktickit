import { getPrisma } from "../src/prisma.js";

// Issue 3 — seed the four supported categories.
// The four names are: Account and Access, Hardware, Software, Network.
// Requirement: running the seed twice must NOT create duplicates.
// Hint: prisma.category.upsert({ where:{name}, update:{}, create:{name} }).
async function main() {
  const prisma = getPrisma();
  
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

  const systems = [
    "ERP",
    "HRIS",
    "Email",
    "Intranet",
    "CRM",
    "Finance"
  ];

  console.log("Seeding related systems...");
  for (const name of systems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`Upserted related system: ${name}`);
  }

  const requesters = [
    { name: "John Doe", email: "john@example.com", isActive: true },
    { name: "Jane Smith", email: "jane@example.com", isActive: true },
    { name: "Alice Johnson", email: "alice@example.com", isActive: true },
    { name: "Bob Inactive", email: "bob@example.com", isActive: false },
  ];

  console.log("Seeding requester users...");
  for (const user of requesters) {
    await prisma.requesterUser.upsert({
      where: { email: user.email },
      update: { name: user.name, isActive: user.isActive },
      create: user,
    });
    console.log(`Upserted requester: ${user.name}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
