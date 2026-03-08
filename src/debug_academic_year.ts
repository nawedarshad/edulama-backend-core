
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Academic Year Debug ---');
    const schools = await prisma.school.findMany({
        include: {
            academicYears: true
        }
    });

    for (const school of schools) {
        console.log(`School: ${school.name} (ID: ${school.id})`);
        if (school.academicYears.length === 0) {
            console.log('  No academic years found.');
        } else {
            school.academicYears.forEach(year => {
                console.log(`  - Year: ${year.name} (ID: ${year.id}), Status: ${year.status}, Start: ${year.startDate}, End: ${year.endDate}`);
            });
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
