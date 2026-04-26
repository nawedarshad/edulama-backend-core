import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const classes = await prisma.class.findMany({ where: { schoolId: 7 } });
    console.log(classes);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
