import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSupportData() {
  try {
    console.log('--- Checking Platform Settings ---');
    const settings = await prisma.platformSetting.findMany({
      where: { key: 'HELP_SUPPORT_EMAIL' }
    });
    console.log('HELP_SUPPORT_EMAIL:', settings);

    console.log('\n--- Checking Support Tickets (ContactInquiry) ---');
    const tickets = await prisma.contactInquiry.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Found ${tickets.length} recent tickets:`);
    tickets.forEach(t => {
      console.log(`- ID: ${t.id}, Name: ${t.name}, Status: ${t.status}, CreatedAt: ${t.createdAt}`);
    });

  } catch (error) {
    console.error('Error checking data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSupportData();
