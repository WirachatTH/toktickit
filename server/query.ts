import { getPrisma } from './src/prisma.js';

async function main() {
  const tickets = await getPrisma().ticket.findMany({
    include: {
      category: true,
      system: true,
      requester: true,
      attachments: true
    }
  });
  console.log(JSON.stringify(tickets, null, 2));
}

main().catch(console.error);
