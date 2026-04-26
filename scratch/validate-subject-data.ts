import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function validate() {
    console.log('--- STARTING SUBJECT MODULE INTEGRITY AUDIT (SCHOOL 7) ---');
    const schoolId = 7;

    const [subjects, teachers, assignments, classConfigs] = await Promise.all([
        prisma.subject.count({ where: { schoolId } }),
        prisma.teacherProfile.count({ where: { schoolId, isActive: true } }),
        prisma.subjectAssignment.count({ where: { schoolId, isActive: true } }),
        prisma.classSubject.count({ where: { schoolId } })
    ]);

    console.log(`Global Subjects: ${subjects}`);
    console.log(`Active Teachers: ${teachers}`);
    console.log(`Teacher-Subject Assignments: ${assignments}`);
    console.log(`Class-Subject Configurations: ${classConfigs}`);

    // Check for orphaned assignments
    const orphans = await prisma.subjectAssignment.findMany({
        where: {
            schoolId,
            OR: [
                { classId: null, sectionId: null, groupId: null },
                { teacherId: null }
            ]
        }
    });

    if (orphans.length > 0) {
        console.warn(`[WARNING] Found ${orphans.length} orphaned assignments!`);
    } else {
        console.log('[SUCCESS] No orphaned assignments found.');
    }

    // Check for Duplicate Configs (Security Violation)
    const duplicateConfigs = await prisma.$queryRaw`
        SELECT "sectionId", "subjectId", COUNT(*) 
        FROM "ClassSubject" 
        WHERE "schoolId" = 7 
        GROUP BY "sectionId", "subjectId" 
        HAVING COUNT(*) > 1
    `;

    if ((duplicateConfigs as any[]).length > 0) {
        console.error('[FAIL] Duplicate configurations detected in database!', duplicateConfigs);
    } else {
        console.log('[SUCCESS] Data Deduplication verified at DB level.');
    }

    console.log('--- AUDIT COMPLETE ---');
}

validate().catch(console.error).finally(() => prisma.$disconnect());
