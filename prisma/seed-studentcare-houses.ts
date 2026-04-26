import { PrismaClient, AuthType } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    console.log(`🌱 Seeding Houses and allocating students for schoolId: ${schoolId}...`);

    // 1. Seed 4 Teachers for House Masters
    console.log('   - Seeding House Masters...');
    const teachers: any[] = [];
    const teacherNames = ['Vikram Seth', 'Amrita Pritam', 'Khushwant Singh', 'Jhumpa Lahiri'];
    
    for (const name of teacherNames) {
        const username = name.toLowerCase().replace(' ', '.');
        
        // 1a. Create User
        const user = await prisma.user.create({
            data: {
                name,
                isActive: true,
                // identity via AuthIdentity
                authIdentities: {
                    create: {
                        schoolId,
                        type: AuthType.USERNAME,
                        value: username,
                        secret: 'password123', // Demo password
                        verified: true
                    }
                }
            }
        });

        // 1b. Create Teacher Profile
        const teacher = await prisma.teacherProfile.create({
            data: {
                userId: user.id,
                schoolId,
                empCode: `EMP-H-${Math.floor(Math.random() * 1000)}`,
                department: 'House Administration',
                isActive: true
            }
        });
        teachers.push(teacher);
    }

    // 2. Seed 4 Houses
    console.log('   - Creating Houses (Red, Blue, Green, Yellow)...');
    const housesData = [
        { name: 'Red House', color: '#EF4444', motto: 'Courage and Power' },
        { name: 'Blue House', color: '#3B82F6', motto: 'Wisdom and Truth' },
        { name: 'Green House', color: '#10B981', motto: 'Growth and Peace' },
        { name: 'Yellow House', color: '#F59E0B', motto: 'Joy and Intellect' },
    ];

    const houses: any[] = [];
    for (let i = 0; i < housesData.length; i++) {
        const h = housesData[i];
        const house = await prisma.house.upsert({
            where: { schoolId_name: { schoolId, name: h.name } },
            update: { houseMasterId: teachers[i].id },
            create: {
                schoolId,
                name: h.name,
                color: h.color,
                motto: h.motto,
                houseMasterId: teachers[i].id
            }
        });
        houses.push(house);
    }

    // 3. Allocate All Students
    console.log('   - Allocating all students to houses...');
    const students = await prisma.studentProfile.findMany({
        where: { schoolId },
        orderBy: { fullName: 'asc' }
    });

    if (students.length === 0) {
        console.warn('⚠️ No students found for schoolId 7. Skipping allocation.');
    } else {
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const house = houses[i % houses.length]; // Round-robin allocation
            
            await prisma.studentProfile.update({
                where: { id: student.id },
                data: { houseId: house.id }
            });
        }
    }

    // 4. Assign Captains
    console.log('   - Assigning House Captains...');
    for (const house of houses) {
        const houseStudents = await prisma.studentProfile.findMany({
            where: { houseId: house.id },
            take: 2,
            orderBy: { id: 'desc' }
        });

        if (houseStudents.length >= 2) {
            await prisma.house.update({
                where: { id: house.id },
                data: {
                    captainStudentId: houseStudents[0].id,
                    viceCaptainStudentId: houseStudents[1].id
                }
            });
            console.log(`     ✅ ${house.name}: Captain -> ${houseStudents[0].fullName}`);
        }
    }

    console.log(`✨ Seeding complete. 4 Houses created. ${students.length} students allocated.`);
}

seed()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
