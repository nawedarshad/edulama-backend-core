const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  try {
    console.log('--- FINAL DATABASE CHECK ---');
    const dbUrl = process.env.DATABASE_URL;
    console.log('Using DATABASE_URL:', dbUrl ? dbUrl.split('@')[1] : 'NOT SET');

    const tickets = await prisma.contactInquiry.findMany();
    console.log(`TOTAL tickets found: ${tickets.length}`);
    tickets.forEach(t => {
      console.log(`- [${t.id}] ${t.title} (${t.email})`);
    });

    const settings = await prisma.platformSetting.findMany();
    console.log(`TOTAL settings found: ${settings.length}`);
    settings.forEach(s => {
      console.log(`- ${s.key}: ${s.value}`);
    });

  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
