import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const usersInSchool1 = await prisma.userSchool.findMany({
        where: { schoolId: 1 },
        include: { user: true }
    });

    console.log(JSON.stringify(usersInSchool1, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
