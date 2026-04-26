import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const ay = await prisma.academicYear.findMany({ where: { schoolId: 7 } });
    console.log(ay);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
