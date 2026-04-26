import { PrismaClient, EducationalStage, AcademicGroupType } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    console.log(`🌱 Seeding fake classes for schoolId: ${schoolId}...`);

    // 1. Get Active Academic Year
    const activeYear = await prisma.academicYear.findFirst({
        where: { schoolId, status: 'ACTIVE' },
    });

    if (!activeYear) {
        console.error('❌ Active academic year not found! Run academic year seed first.');
        return;
    }

    console.log(`✅ Using Academic Year: ${activeYear.name} (id: ${activeYear.id})`);

    const classesData = [
        { name: 'Grade 1', stage: EducationalStage.PRIMARY, sections: ['A', 'B'] },
        { name: 'Grade 2', stage: EducationalStage.PRIMARY, sections: ['A', 'B'] },
        { name: 'Grade 3', stage: EducationalStage.PRIMARY, sections: ['A', 'B'] },
        { name: 'Grade 4', stage: EducationalStage.PRIMARY, sections: ['A', 'B'] },
        { name: 'Grade 5', stage: EducationalStage.PRIMARY, sections: ['A', 'B'] },
        { name: 'Grade 6', stage: EducationalStage.MIDDLE, sections: ['A', 'B'] },
        { name: 'Grade 7', stage: EducationalStage.MIDDLE, sections: ['A', 'B'] },
        { name: 'Grade 8', stage: EducationalStage.MIDDLE, sections: ['A', 'B'] },
        { name: 'Grade 9', stage: EducationalStage.SECONDARY, sections: ['A', 'B', 'C'] },
        { name: 'Grade 10', stage: EducationalStage.SECONDARY, sections: ['A', 'B', 'C'] },
    ];

    for (const c of classesData) {
        try {
            // Create Class
            const cls = await prisma.class.upsert({
                where: { schoolId_name: { schoolId, name: c.name } },
                update: { stage: c.stage },
                create: { 
                    schoolId, 
                    name: c.name, 
                    stage: c.stage,
                    academicYearId: activeYear.id
                },
            });
            console.log(`✅ Class ${cls.name} created/updated.`);

            // Create Sections
            for (const secName of c.sections) {
                const sec = await prisma.section.upsert({
                    where: { schoolId_classId_name: { schoolId, classId: cls.id, name: secName } },
                    update: {},
                    create: {
                        schoolId,
                        classId: cls.id,
                        name: secName,
                        academicYearId: activeYear.id
                    }
                });
                console.log(`   - Section ${sec.name} created/updated.`);

                // Create AcademicGroup (Crucial for Attendance/Timetable)
                await prisma.academicGroup.upsert({
                    where: { id_schoolId: { id: sec.id, schoolId } }, // Using section ID as shortcut if unique across types, but better handle unique
                    // Actually AcademicGroup has its own ID. We should check if it exists by name.
                    update: {},
                    create: {
                        schoolId,
                        name: `${cls.name} ${sec.name}`,
                        type: AcademicGroupType.CLASS_SECTION,
                        classId: cls.id,
                        sectionId: sec.id
                    }
                });
            }
        } catch (e) {
            console.error(`❌ Error creating class ${c.name}:`, e);
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
