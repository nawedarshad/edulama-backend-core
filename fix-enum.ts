import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "AttendanceTrackingStrategy" RENAME VALUE 'SIMPLE' TO 'ATTENDANCE_SIMPLE';`);
    console.log('Successfully renamed enum value in DB!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
