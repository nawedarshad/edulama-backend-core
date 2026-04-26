import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const grievances = await prisma.grievance.count({ where: { schoolId } });
    const circulars = await prisma.cbseCircular.count();

    console.log({
        grievances,
        circulars
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
