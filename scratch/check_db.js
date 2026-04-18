const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const configs = await prisma.attendanceConfig.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log('Last 5 AttendanceConfigs:', JSON.stringify(configs, null, 2));

  const settings = await prisma.schoolSettings.findFirst({
    select: { schoolId: true, attendanceMode: true }
  });
  console.log('SchoolSettings attendanceMode:', settings);
}

check().catch(console.error).finally(() => prisma.$disconnect());
