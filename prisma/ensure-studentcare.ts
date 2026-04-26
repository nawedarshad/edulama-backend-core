import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const school = await prisma.school.upsert({
        where: { id: 7 },
        update: {},
        create: {
            id: 7,
            name: 'StudentCare',
            code: 'SC-101',
            subdomain: 'studentcare',
            isActive: true
        }
    });

    console.log(`✅ School ${school.name} (ID: ${school.id}) is ready.`);

    // Also ensure academic year
    await prisma.academicYear.upsert({
        where: { id: 1 },
        update: { status: 'ACTIVE' },
        create: {
            id: 1,
            schoolId: 7,
            name: '2024-25',
            status: 'ACTIVE',
            startDate: new Date('2024-04-01'),
            endDate: new Date('2025-03-31')
        }
    });
    console.log('✅ Academic Year 2024-25 is active.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
