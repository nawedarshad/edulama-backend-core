import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function list() {
    const schoolId = 7;
    const sections = await prisma.section.findMany({
        where: { schoolId },
        include: { class: true }
    });

    console.log(`📊 Sections for School ${schoolId}:`);
    sections.forEach(s => {
        console.log(`- ${s.name} (ID: ${s.id}) -> Class: ${s.class.name} (ID: ${s.classId})`);
    });
}

list()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
