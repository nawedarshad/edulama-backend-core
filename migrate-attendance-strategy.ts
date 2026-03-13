
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Migrating attendance tracking strategies...');
  
  const result = await prisma.schoolSettings.updateMany({
    where: {
      trackingStrategy: {
        in: ['ONLY_ATTENDANCE', 'ATTENDANCE_AND_LATE_SEPARATE', 'LATE_IN_ATTENDANCE'] as any
      }
    },
    data: {
      trackingStrategy: 'ATTENDANCE_SIMPLE' as any
    }
  });

  console.log(`Updated ${result.count} school settings to ATTENDANCE_SIMPLE strategy.`);
}

migrate()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
