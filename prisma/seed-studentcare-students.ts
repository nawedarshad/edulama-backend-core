import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    console.log(`🌱 Seeding fake students for schoolId: ${schoolId}...`);

    // 1. Get Active Academic Year
    const activeYear = await prisma.academicYear.findFirst({
        where: { schoolId, status: 'ACTIVE' },
    });

    if (!activeYear) {
        console.error('❌ Active academic year not found!');
        return;
    }

    // 2. Get all sections for this school
    const sections = await prisma.section.findMany({
        where: { schoolId },
        include: { class: true }
    });

    console.log(`✅ Found ${sections.length} sections to populate.`);

    const firstNames = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Sai', 'Ishaan', 'Aryan', 'Krishna', 'Ram', 'Siddharth', 'Ananya', 'Diya', 'Ishani', 'Myra', 'Saanvi', 'Anika', 'Aadhya', 'Pari', 'Riya', 'Kavya'];
    const lastNames = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Reddy', 'Kumar', 'Iyer', 'Yadav', 'Joshi'];

    let admissionCounter = 2000;

    for (const sec of sections) {
        console.log(`   - Populating ${sec.class.name} ${sec.name}...`);
        
        for (let i = 1; i <= 5; i++) {
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const fullName = `${firstName} ${lastName}`;
            const admissionNo = `SC-${admissionCounter++}`;
            const rollNo = `${i}`;

            try {
                await prisma.studentProfile.upsert({
                    where: { 
                        schoolId_admissionNo: { 
                            schoolId, 
                            admissionNo 
                        } 
                    },
                    update: {
                        fullName,
                        rollNo,
                        classId: sec.classId,
                        sectionId: sec.id
                    },
                    create: {
                        schoolId,
                        academicYearId: activeYear.id,
                        admissionNo,
                        rollNo,
                        fullName,
                        classId: sec.classId,
                        sectionId: sec.id,
                        personalInfo: {
                            create: {
                                gender: Math.random() > 0.5 ? 'MALE' : 'FEMALE',
                                city: 'Pune',
                                state: 'Maharashtra'
                            }
                        }
                    }
                });
            } catch (e) {
                console.error(`     ❌ Error creating student ${fullName}:`, e);
            }
        }
    }

    console.log('✨ Student seeding complete.');
}

seed()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
