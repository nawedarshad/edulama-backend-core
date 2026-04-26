import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const school = await prisma.school.findFirst();
    if (!school) {
        console.log("No school found");
        return;
    }
    const academicYears = await prisma.academicYear.findMany({
        where: { schoolId: school.id }
    });
    const teachers = await prisma.teacherProfile.findMany({
        where: { schoolId: school.id }
    });
    const students = await prisma.studentProfile.findMany({
        where: { schoolId: school.id }
    });
    const users = await prisma.user.findMany({
        include: { userSchools: true }
    });

    console.log(JSON.stringify({
        schoolId: school.id,
        academicYearsCount: academicYears.length,
        academicYears: academicYears.map(y => ({ id: y.id, name: y.name, status: y.status })),
        teachersCount: teachers.length,
        studentsCount: students.length,
        usersCount: users.length
    }, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
