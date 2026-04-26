import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function audit() {
    const schoolId = 7;
    console.log(`Auditing School ${schoolId}...`);

    const academicYear = await prisma.academicYear.findFirst({
        where: { schoolId, status: 'ACTIVE' }
    });

    if (!academicYear) {
        console.error('No active academic year found!');
        return;
    }

    console.log(`Active Academic Year: ${academicYear.name} (ID: ${academicYear.id})`);

    const classSubjects = await prisma.classSubject.findMany({
        where: { schoolId, academicYearId: academicYear.id },
        include: { subject: true, class: true, section: true }
    });

    console.log(`Total Class-Subject Configs: ${classSubjects.length}`);

    const assignments = await prisma.subjectAssignment.findMany({
        where: { schoolId, academicYearId: academicYear.id, isActive: true },
        include: { teacher: { include: { user: true } } }
    });

    console.log(`Total Active Teacher Assignments: ${assignments.length}`);

    // Check for "Unassigned" targets
    let unassignedCount = 0;
    for (const cs of classSubjects) {
        const assignment = assignments.find(a => 
            a.classId === cs.classId && 
            a.sectionId === cs.sectionId && 
            a.subjectId === cs.subjectId
        );

        if (!assignment) {
            unassignedCount++;
            // console.log(`UNASSIGNED: ${cs.class.name} - ${cs.section.name} - ${cs.subject.name}`);
        }
    }

    console.log(`Found ${unassignedCount} unassigned configs in Subject List mapping.`);
    
    if (assignments.length > 0) {
        const sample = assignments[0];
        const teacherName = sample.teacher?.user?.name || 'Unknown';
        console.log(`Sample Assignment: ClassID:${sample.classId}, SecID:${sample.sectionId}, SubjID:${sample.subjectId} -> Teacher:${teacherName}`);
        
        const matchedConfig = classSubjects.find(cs => 
            cs.classId === sample.classId && 
            cs.sectionId === sample.sectionId && 
            cs.subjectId === sample.subjectId
        );
        
        if (matchedConfig) {
            console.log(`✅ MATCH FOUND IN CONFIGS: ${matchedConfig.class.name} - ${matchedConfig.section.name}`);
        } else {
            console.log(`❌ NO MATCHING CONFIG FOUND FOR THIS ASSIGNMENT!`);
        }
    }
}

audit().catch(console.error).finally(() => prisma.$disconnect());
