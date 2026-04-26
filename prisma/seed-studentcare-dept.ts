import { PrismaClient, DepartmentType, RoleInDepartment } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    console.log(`🌱 Seeding fake departments for schoolId: ${schoolId}...`);

    const depts = [
        { code: 'SCI', name: 'Science', type: DepartmentType.ACADEMIC, headId: 8, description: 'Faculty of Natural Sciences' },
        { code: 'MATH', name: 'Mathematics', type: DepartmentType.ACADEMIC, headId: 9, description: 'Department of Mathematical Sciences' },
        { code: 'CS', name: 'Computer Science', type: DepartmentType.ACADEMIC, headId: 10, description: 'Department of Computing and AI' },
        { code: 'ADM', name: 'Administration', type: DepartmentType.ADMINISTRATIVE, headId: 11, description: 'School Operations and Admin' },
        { code: 'LIB', name: 'Library', type: DepartmentType.ADMINISTRATIVE, headId: 22, description: 'Central Library Staff' },
    ];

    for (const d of depts) {
        try {
            const dept = await prisma.department.upsert({
                where: { schoolId_code: { schoolId, code: d.code } },
                update: d,
                create: { ...d, schoolId },
            });
            console.log(`✅ Department ${dept.code} created/updated.`);

            // Add head as a member too if not already
            if (d.headId) {
                await prisma.departmentMember.upsert({
                    where: { departmentId_userId: { departmentId: dept.id, userId: d.headId } },
                    update: { role: 'HOD' },
                    create: { departmentId: dept.id, userId: d.headId, role: 'HOD' },
                });
            }
        } catch (e) {
            console.error(`❌ Error creating ${d.code}:`, e);
        }
    }

    console.log('✨ Seeding complete.');
}

seed()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
