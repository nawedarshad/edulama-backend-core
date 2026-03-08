import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const assignments = await prisma.subjectAssignment.findMany({
        include: {
            class: true,
            section: true,
            group: true,
            subject: true
        }
    });

    console.log("ALL ASSIGNMENTS:", JSON.stringify(assignments, null, 2));

    const groups = await prisma.academicGroup.findMany({
        include: { class: true, section: true }
    });

    console.log("ALL GROUPS:", JSON.stringify(groups, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
