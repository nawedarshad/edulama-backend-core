import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const teachers = await prisma.teacherProfile.findMany({
        where: { schoolId },
        include: { user: true },
        take: 10
    });

    console.log(teachers.map(t => ({ id: t.id, name: t.user?.name, department: t.department })));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
