import { PrismaClient, RoomType, RoomStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    console.log(`🌱 Seeding rooms and assignments for schoolId: ${schoolId}...`);

    // 1. Get Active Academic Year
    const activeYear = await prisma.academicYear.findFirst({
        where: { schoolId, status: 'ACTIVE' },
    });

    if (!activeYear) {
        console.error('❌ Active academic year not found!');
        return;
    }

    // 2. Define Room Data
    const specialRooms = [
        { name: 'Main Auditorium', code: 'AUD-01', type: RoomType.AUDITORIUM, capacity: 500 },
        { name: 'Staff Room - Block A', code: 'SR-A', type: RoomType.STAFF_ROOM, capacity: 30 },
        { name: 'Staff Room - Block B', code: 'SR-B', type: RoomType.STAFF_ROOM, capacity: 30 },
        { name: 'Principal Office', code: 'OFF-01', type: RoomType.STAFF_ROOM, capacity: 10 },
        { name: 'Science Lab', code: 'LAB-SCI', type: RoomType.LAB, capacity: 40 },
        { name: 'Computer Lab', code: 'LAB-COMP', type: RoomType.LAB, capacity: 60 },
        { name: 'Maths Lab', code: 'LAB-MATH', type: RoomType.LAB, capacity: 30 },
    ];

    console.log('   - Creating special rooms...');
    for (const r of specialRooms) {
        await prisma.room.upsert({
            where: { schoolId_code: { schoolId, code: r.code } },
            update: { name: r.name, roomType: r.type, capacity: r.capacity },
            create: { schoolId, name: r.name, code: r.code, roomType: r.type, capacity: r.capacity, status: RoomStatus.ACTIVE }
        });
    }

    // 3. Create Classrooms
    const sections = await prisma.section.findMany({
        where: { schoolId },
        include: { class: true },
        orderBy: [{ classId: 'asc' }, { name: 'asc' }]
    });

    console.log(`   - Creating classrooms for ${sections.length} sections + 3 extra...`);
    const totalClassrooms = sections.length + 3;
    const classrooms: any[] = [];

    for (let i = 1; i <= totalClassrooms; i++) {
        const code = `CR-${i.toString().padStart(3, '0')}`;
        const name = `Classroom ${i}`;
        const room = await prisma.room.upsert({
            where: { schoolId_code: { schoolId, code } },
            update: { name, roomType: RoomType.CLASSROOM },
            create: { schoolId, name, code, roomType: RoomType.CLASSROOM, capacity: 40, status: RoomStatus.ACTIVE }
        });
        classrooms.push(room);
    }

    // 4. Allocate Rooms to Sections
    console.log('   - Allocating rooms to sections...');
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const room = classrooms[i];

        await prisma.roomAssignment.upsert({
            where: { schoolId_academicYearId_sectionId: { schoolId, academicYearId: activeYear.id, sectionId: section.id } },
            update: { roomId: room.id, isActive: true },
            create: {
                schoolId,
                academicYearId: activeYear.id,
                sectionId: section.id,
                roomId: room.id,
                isActive: true
            }
        });
        console.log(`     ✅ Allocated ${room.code} to ${section.class.name} ${section.name}`);
    }

    console.log(`✨ Room seeding complete. Created ${classrooms.length + specialRooms.length} rooms. 3 extra classrooms remaining unoccupied.`);
}

seed()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
