import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const teachers = await prisma.teacherProfile.findMany({
        where: { schoolId },
        include: { user: true }
    });
    const rooms = await prisma.room.findMany({
        where: { schoolId }
    });

    console.log(JSON.stringify({
        teachers: teachers.map(t => ({ id: t.id, name: t.user?.name, department: t.department })),
        rooms: rooms.map(r => ({ id: r.id, name: r.name }))
    }, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
