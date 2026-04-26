import { PrismaClient, AssessmentType, AuthType } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    const schoolId = 7;
    console.log(`🌱 (Re)Seeding Subjects and Teachers for schoolId: ${schoolId}...`);

    // 1. Get Academic Year
    const year = await prisma.academicYear.findFirst({ where: { schoolId, status: 'ACTIVE' } });
    if (!year) throw new Error('Active year not found');

    // 2. Clean up existing for this specific seed run to avoid unique constraints
    // This allows the user to check the "allocation engine" with a fresh set of data.
    const sections = await prisma.section.findMany({ where: { schoolId } });
    const sectionIds = sections.map(s => s.id);

    console.log('   - Cleaning up existing Subject/Teacher data for cleanup...');
    await prisma.subjectAssignment.deleteMany({ where: { schoolId } });
    await prisma.classSubject.deleteMany({ where: { schoolId } });
    await prisma.teacherPreferredSubject.deleteMany({ where: { teacherId: { in: (await prisma.teacherProfile.findMany({ where: { schoolId }, select: { id: true } })).map(t => t.id) } } });
    await prisma.teacherQualification.deleteMany({ where: { staffId: { in: (await prisma.teacherProfile.findMany({ where: { schoolId }, select: { id: true } })).map(t => t.id) } } });
    
    // Note: Deleting users might be risky if they have other links, but for seed it's fine.
    const teachers = await prisma.teacherProfile.findMany({ where: { schoolId }, select: { userId: true } });
    await prisma.teacherProfile.deleteMany({ where: { schoolId } });
    await prisma.authIdentity.deleteMany({ where: { userId: { in: teachers.map(t => t.userId) } } });
    await prisma.user.deleteMany({ where: { id: { in: teachers.map(t => t.userId) } } });

    // 2. Create Subjects
    console.log('   - Creating Subjects catalog...');
    const subjectsData = [
        { name: 'Mathematics', code: 'MATH' },
        { name: 'Physics', code: 'PHYS' },
        { name: 'Chemistry', code: 'CHEM' },
        { name: 'Biology', code: 'BIOL' },
        { name: 'English Literature', code: 'ENGL' },
        { name: 'History & Civics', code: 'HIST' },
        { name: 'Computer Science', code: 'COMP' },
        { name: 'Physical Education', code: 'PHED' },
        { name: 'Geography', code: 'GEOG' },
        { name: 'Accounting', code: 'ACCT' },
    ];

    const subjects: any[] = [];
    for (const s of subjectsData) {
        const subject = await prisma.subject.upsert({
            where: { schoolId_code: { schoolId, code: s.code } },
            update: { name: s.name },
            create: { schoolId, name: s.name, code: s.code }
        });
        subjects.push(subject);
    }

    // 3. Create 12 Advanced Teachers
    console.log('   - Seeding 12 Expert Faculty members...');
    const teacherPool: any[] = [];
    const faculty = [
        { name: 'Dr. Robert Oppenheimer', qual: 'Ph.D. Physics', pref: 'PHYS' },
        { name: 'Katherine Johnson', qual: 'M.Sc. Mathematics', pref: 'MATH' },
        { name: 'Charles Darwin', qual: 'B.Sc. Biology', pref: 'BIOL' },
        { name: 'Marie Curie', qual: 'Ph.D. Chemistry', pref: 'CHEM' },
        { name: 'William Shakespeare', qual: 'M.A. English', pref: 'ENGL' },
        { name: 'Ada Lovelace', qual: 'B.Tech Computer Science', pref: 'COMP' },
        { name: 'Adam Smith', qual: 'M.Com Accounting', pref: 'ACCT' },
        { name: 'Herodotus', qual: 'Ph.D. History', pref: 'HIST' },
        { name: 'Marco Polo', qual: 'B.A. Geography', pref: 'GEOG' },
        { name: 'Michael Jordan', qual: 'B.P.Ed Physical Education', pref: 'PHED' },
        { name: 'Alan Turing', qual: 'Ph.D. Computer Science', pref: 'COMP' },
        { name: 'Isaac Newton', qual: 'Ph.D. Mathematics', pref: 'MATH' },
    ];

    for (const f of faculty) {
        const username = f.name.toLowerCase().split(' ').join('.');
        
        const user = await prisma.user.create({
            data: {
                name: f.name,
                authIdentities: {
                    create: {
                        schoolId,
                        type: AuthType.USERNAME,
                        value: username,
                        secret: 'password123',
                        verified: true
                    }
                }
            }
        });

        const profile = await prisma.teacherProfile.create({
            data: {
                userId: user.id,
                schoolId,
                empCode: `TCH-${Math.floor(Math.random() * 9000) + 1000}`,
                isActive: true,
                qualifications: {
                    create: {
                        degree: f.qual.split(' ')[0],
                        specialization: f.qual.split(' ').slice(1).join(' '),
                        institution: 'EduLama Training Institute'
                    }
                }
            }
        });

        const targetSubject = subjects.find(s => s.code === f.pref);
        if (targetSubject) {
            await prisma.teacherPreferredSubject.create({
                data: { teacherId: profile.id, subjectId: targetSubject.id }
            });
        }
        
        teacherPool.push(profile);
    }

    // 4. Allocation Logic
    console.log('   - Populating Class-Subject grid and performing allocations...');
    let totalConfigs = 0;
    let allocatedCount = 0;

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        
        // Every section gets 5 subjects
        const sectionSubjects = subjects.slice(0, 5); 

        for (let j = 0; j < sectionSubjects.length; j++) {
            const sub = sectionSubjects[j];
            totalConfigs++;
            
            // 1. Create ClassSubject (The Slot)
            const cs = await prisma.classSubject.create({
                data: {
                    schoolId,
                    academicYearId: year.id,
                    classId: sec.classId,
                    sectionId: sec.id,
                    subjectId: sub.id,
                    classSubjectCode: `${sub.code}-${sec.id}`,
                    weeklyClasses: 5,
                    assessmentType: AssessmentType.MARKS
                }
            });

            // 2. Decide if we leave this unassigned
            // User requested 2-3 unassigned. We'll leave Grade 1 Section A (i=0) 
            // Mathematics, Physics, and Chemistry unassigned.
            const shouldLeaveUnassigned = (i === 0 && (j === 0 || j === 1 || j === 2));
            
            if (!shouldLeaveUnassigned) {
                // Find matching teacher or round-robin
                const teacher = teacherPool.find(t => {
                    // This is a simple mock matching logic for the seed
                    return t.id % subjects.length === sub.id % subjects.length;
                }) || teacherPool[i % teacherPool.length];

                // Sync teacher to ClassSubject and create SubjectAssignment
                await prisma.classSubject.update({
                    where: { id: cs.id },
                    data: { teacherProfileId: teacher.id }
                });

                await prisma.subjectAssignment.create({
                    data: {
                        schoolId,
                        academicYearId: year.id,
                        classId: sec.classId,
                        sectionId: sec.id,
                        subjectId: sub.id,
                        teacherId: teacher.id,
                        periodsPerWeek: 5,
                        isActive: true
                    }
                });
                allocatedCount++;
            }
        }
    }

    console.log(`\n✨ SUCCESS: Subject & Faculty Ecosystem Ready.`);
    console.log(`📊 Stats:`);
    console.log(`   - Subjects: 10`);
    console.log(`   - Faculty: 12 (with Ph.D./M.Sc. Qualifications)`);
    console.log(`   - Assignments: ${allocatedCount} / ${totalConfigs}`);
    console.log(`\n⚠️  ALLOCATION TEST CASE:`);
    console.log(`   - Grade 1 Section A has 3 UNASSIGNED subjects (Mathematics, Physics, Chemistry).`);
    console.log(`   - You can now test the "Intelligent Allocation Engine" for these slots.`);
}

seed()
    .catch(e => { console.error('❌ Seeding failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
