import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const school = await prisma.school.findFirst();
    const academicYear = await prisma.academicYear.findFirst({
        where: { schoolId: school?.id, status: 'ACTIVE' }
    });
    const teacher = await prisma.teacherProfile.findFirst({
        where: { schoolId: school?.id }
    });
    const student = await prisma.studentProfile.findFirst({
        where: { schoolId: school?.id },
        include: { user: true }
    });

    console.log(JSON.stringify({
        schoolId: school?.id,
        academicYearId: academicYear?.id,
        teacherId: teacher?.id,
        studentUserId: student?.userId,
        studentId: student?.id
    }, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
