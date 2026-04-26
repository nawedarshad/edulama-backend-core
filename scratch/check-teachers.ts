import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const teachers = await prisma.teacherProfile.findMany({
        where: { schoolId: 7 },
        include: { user: true }
    });
    console.log(teachers);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
