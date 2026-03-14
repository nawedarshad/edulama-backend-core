import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Diagnostic: Checking TimeSlot 8 ---');
    const slot = await prisma.timeSlot.findUnique({
        where: { id: 8 },
        include: { period: true }
    });
    console.log('TimeSlot:', JSON.stringify(slot, null, 2));

    const allSlots = await prisma.timeSlot.findMany({
        take: 20
    });
    console.log('\n--- First 20 TimeSlots ---');
    console.table(allSlots.map(s => ({ id: s.id, schoolId: s.schoolId, day: s.day, periodId: s.periodId })));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
