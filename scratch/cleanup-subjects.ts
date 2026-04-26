import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
    const schoolId = 7;
    console.log(`🧹 Cleaning up Subject Module data for schoolId: ${schoolId}...`);

    await prisma.subjectAssignment.deleteMany({ where: { schoolId } });
    await prisma.classSubject.deleteMany({ where: { schoolId } });
    await prisma.teacherPreferredSubject.deleteMany({ where: { teacherId: { in: (await prisma.teacherProfile.findMany({ where: { schoolId }, select: { id: true } })).map(t => t.id) } } });
    
    // Note: Qualifications are tied to staffProfile (StaffProfileId) which usually maps to TeacherProfile
    // The previous seeder created them.
    await prisma.teacherQualification.deleteMany({ where: { staffId: { in: (await prisma.teacherProfile.findMany({ where: { schoolId }, select: { id: true } })).map(t => t.id) } } });

    const teachers = await prisma.teacherProfile.findMany({ where: { schoolId }, select: { userId: true } });
    await prisma.teacherProfile.deleteMany({ where: { schoolId } });
    await prisma.authIdentity.deleteMany({ where: { userId: { in: teachers.map(t => t.userId) } } });
    await prisma.user.deleteMany({ where: { id: { in: teachers.map(t => t.userId) } } });
    await prisma.subject.deleteMany({ where: { schoolId } });

    console.log('✅ Subject Module data erased.');
}

cleanup().catch(console.error).finally(() => prisma.$disconnect());
