import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSettings() {
  try {
    console.log('Seeding HELP_SUPPORT_EMAIL setting...');
    const existing = await prisma.platformSetting.findFirst({
      where: { key: 'HELP_SUPPORT_EMAIL' }
    });

    if (!existing) {
      await prisma.platformSetting.create({
        data: {
          key: 'HELP_SUPPORT_EMAIL',
          value: 'admin@edulama.com'
        }
      });
      console.log('Created HELP_SUPPORT_EMAIL: admin@edulama.com');
    } else {
      console.log('HELP_SUPPORT_EMAIL already exists:', existing.value);
    }
  } catch (error) {
    console.error('Error seeding settings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSettings();
