const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  try {
    console.log('--- Database Check & Seed ---');
    
    // 1. Ensure HELP_SUPPORT_EMAIL exists
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'HELP_SUPPORT_EMAIL' }
    }).catch(() => null) || await prisma.platformSetting.findFirst({
      where: { key: 'HELP_SUPPORT_EMAIL' }
    });

    if (!setting) {
      await prisma.platformSetting.create({
        data: {
          key: 'HELP_SUPPORT_EMAIL',
          value: 'admin@edulama.com'
        }
      });
      console.log('CREATED setting: HELP_SUPPORT_EMAIL = admin@edulama.com');
    } else {
      console.log('EXISTING setting: HELP_SUPPORT_EMAIL =', setting.value);
    }

    // 2. Count tickets
    const count = await prisma.contactInquiry.count();
    console.log('TOTAL tickets in database:', count);

    // 3. List all settings just in case
    const allSettings = await prisma.platformSetting.findMany();
    console.log('ALL settings:', allSettings);

  } catch (e) {
    console.error('FATAL:', e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
