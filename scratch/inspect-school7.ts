import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const academicYears = await prisma.academicYear.findMany({
        where: { schoolId }
    });
    const teachers = await prisma.teacherProfile.findMany({
        where: { schoolId },
        include: { user: true }
    });
    const students = await prisma.studentProfile.findMany({
        where: { schoolId },
        include: { user: true }
    });

    console.log(JSON.stringify({
        academicYears,
        teachers: teachers.map(t => ({ id: t.id, name: t.user?.name })),
        students: students.map(s => ({ id: s.id, name: s.user?.name }))
    }, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
