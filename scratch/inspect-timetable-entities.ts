import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const subjects = await prisma.subject.findMany({ where: { schoolId } });
    const rooms = await prisma.room.findMany({ where: { schoolId } });
    const groups = await prisma.academicGroup.findMany({ where: { schoolId } });
    const timeSlots = await prisma.timeSlot.findMany({ where: { schoolId, academicYearId: 6 } });

    console.log(JSON.stringify({
        subjectsCount: subjects.length,
        subjects: subjects.map(s => ({ id: s.id, name: s.name })),
        roomsCount: rooms.length,
        rooms: rooms.map(r => ({ id: r.id, name: r.name })),
        groupsCount: groups.length,
        groups: groups.map(g => ({ id: g.id, name: g.name })),
        timeSlotsCount: timeSlots.length,
        timeSlots: timeSlots.map(ts => ({ id: ts.id, day: ts.day, start: ts.startTime, end: ts.endTime }))
    }, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
