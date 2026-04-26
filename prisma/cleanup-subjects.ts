import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
    const schoolId = 7;
    console.log(`🧹 Cleaning up misaligned Class-Subject configurations for school ${schoolId}...`);

    const records = await prisma.classSubject.findMany({
        where: { schoolId },
        include: { section: true }
    });

    let deleted = 0;
    for (const record of records) {
        // If the record's classId doesn't match the section's classId, it's corrupt.
        if (record.section && record.section.classId !== record.classId) {
            await prisma.classSubject.delete({ where: { id: record.id } });
            deleted++;
        }
    }

    console.log(`✅ Cleanup complete. Removed ${deleted} misaligned entries.`);
}

cleanup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
