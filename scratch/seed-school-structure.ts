import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    const year = await prisma.academicYear.findFirst({ where: { schoolId, status: 'ACTIVE' } });
    if (!year) {
        console.error('No active academic year found for school 7. Run ensure-studentcare first.');
        return;
    }

    console.log(`🏗️ Seeding Classes and Sections for StudentCare (ID: ${schoolId})...`);

    const grades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
    const sections = ['A', 'B'];

    for (const gradeName of grades) {
        const cls = await prisma.class.upsert({
            where: { 
                schoolId_name: { 
                    schoolId, 
                    name: gradeName 
                } 
            },
            update: {},
            create: {
                schoolId,
                academicYearId: year.id,
                name: gradeName
            }
        });

        for (const secName of sections) {
            await prisma.section.upsert({
                where: {
                    schoolId_classId_name: {
                        schoolId,
                        classId: cls.id,
                        name: secName
                    }
                },
                update: {},
                create: {
                    schoolId,
                    academicYearId: year.id,
                    classId: cls.id,
                    name: secName
                }
            });
        }
    }

    console.log('✅ Structure Seed Complete.');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
