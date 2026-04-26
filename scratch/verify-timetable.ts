import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const groupId = 25;
    const entries = await prisma.timetableEntry.count({
        where: { groupId }
    });
    const slots = await prisma.timeSlot.count({
        where: { schoolId: 7, academicYearId: 6 }
    });

    console.log({
        entriesForGroup25: entries,
        totalSlotsInYear6: slots
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
