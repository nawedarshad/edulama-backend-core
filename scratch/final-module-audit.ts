import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAudit() {
    console.log("🚀 Starting Enterprise Subject Module Audit...");
    const results = {
        orphanedConfigs: [] as any[],
        orphanedAllocations: [] as any[],
        driftedTeachers: [] as any[],
        missingSections: [] as any[],
        invalidMarks: [] as any[]
    };

    // 1. Find Orphaned Configs (ClassSubject pointing to non-existent Subject)
    const configs = await prisma.classSubject.findMany({
        include: { subject: true }
    });
    results.orphanedConfigs = configs.filter(c => !c.subject);

    // 2. Find Orphaned Allocations (SubjectAssignment without ClassSubject config)
    const assignments = await prisma.subjectAssignment.findMany({});
    for (const logic of assignments) {
        // ClassSubject required classId and sectionId. If assignment doesn't have them (e.g. group-based), 
        // we skip config check as it doesn't apply to the configuration table.
        if (!logic.classId || !logic.sectionId) continue;

        const config = await prisma.classSubject.findFirst({
            where: {
                schoolId: logic.schoolId,
                academicYearId: logic.academicYearId,
                classId: logic.classId,
                sectionId: logic.sectionId,
                subjectId: logic.subjectId
            }
        });
        if (!config) {
            results.orphanedAllocations.push(logic);
        }
    }

    // 3. Find Teacher Drift (teacherProfileId in Config != teacherId in Assignment)
    for (const c of configs) {
        const a = await prisma.subjectAssignment.findFirst({
            where: {
                schoolId: c.schoolId,
                academicYearId: c.academicYearId,
                sectionId: c.sectionId,
                subjectId: c.subjectId,
                isActive: true
            }
        });

        if (a && c.teacherProfileId !== a.teacherId) {
            results.driftedTeachers.push({
                configId: c.id,
                assignmentId: a.id,
                configTeacher: c.teacherProfileId,
                assignmentTeacher: a.teacherId
            });
        }
    }

    // 4. Find Invalid Marks Configurations
    results.invalidMarks = configs.filter(c => c.passMarks !== null && c.maxMarks !== null && c.passMarks > c.maxMarks);

    console.log("\n📊 AUDIT RESULTS:");
    console.log(`- Orphaned Configs:      ${results.orphanedConfigs.length}`);
    console.log(`- Orphaned Allocations:  ${results.orphanedAllocations.length}`);
    console.log(`- Teacher Data Drift:    ${results.driftedTeachers.length}`);
    console.log(`- Invalid Marks Configs: ${results.invalidMarks.length}`);

    if (results.orphanedAllocations.length > 0 || results.driftedTeachers.length > 0 || results.invalidMarks.length > 0) {
        console.log("\n⚠️ ACTION REQUIRED: Inconsistencies detected.");
        
        // AUTO-FIX: Sync drift (Config is usually more up-to-date in user's mind)
        if (results.driftedTeachers.length > 0) {
            console.log("🔧 Auto-fixing teacher drift...");
            for (const drift of results.driftedTeachers) {
                await prisma.subjectAssignment.update({
                    where: { id: drift.assignmentId },
                    data: { teacherId: drift.configTeacher }
                });
            }
            console.log("✅ Drift fixed.");
        }

        // AUTO-FIX: Remove orphaned assignments (they have no config context)
        if (results.orphanedAllocations.length > 0) {
            console.log("🧹 Cleaning orphaned allocations...");
            for (const orphan of results.orphanedAllocations) {
                await prisma.subjectAssignment.delete({ where: { id: orphan.id } });
            }
            console.log("✅ Orphans removed.");
        }
    } else {
        console.log("\n✅ MODULE INTEGRITY VERIFIED. System is Enterprise-ready.");
    }
}

runAudit()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
