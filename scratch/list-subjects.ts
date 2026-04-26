import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const subjects = await prisma.subject.findMany({ where: { schoolId } });
    console.log(subjects);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
