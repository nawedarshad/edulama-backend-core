import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugData() {
  const schoolId = 7;
  console.log(`--- Debugging Data for School ${schoolId} ---`);

  const totalDiaries = await prisma.classDiary.count({ where: { schoolId } });
  const totalHomeworks = await prisma.homework.count({ where: { schoolId } });

  console.log(`Total Diaries: ${totalDiaries}`);
  console.log(`Total Homeworks: ${totalHomeworks}`);

  if (totalDiaries > 0) {
    const latestDiaries = await prisma.classDiary.findMany({
      where: { schoolId },
      take: 5,
      orderBy: { lessonDate: 'desc' },
      select: { id: true, lessonDate: true, classId: true, sectionId: true, subjectId: true }
    });
    console.log('Latest Diaries:', JSON.stringify(latestDiaries, null, 2));
  }

  if (totalHomeworks > 0) {
    const latestHomeworks = await prisma.homework.findMany({
      where: { schoolId },
      take: 5,
      orderBy: { dueDate: 'desc' },
      select: { id: true, dueDate: true, classId: true, sectionId: true, subjectId: true }
    });
    console.log('Latest Homeworks:', JSON.stringify(latestHomeworks, null, 2));
  }

  await prisma.$disconnect();
}

debugData();
