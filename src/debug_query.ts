import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['query'] });

async function main() {
    const schoolId = 6;
    const academicYearId = 5;
    const groupId = 1;

    const groupInfo = await prisma.academicGroup.findFirst({
        where: { id: groupId, schoolId }
    });

    console.log("Group Info:", groupInfo);

    if (!groupInfo) return;

    const subjectAssignments = await prisma.subjectAssignment.findMany({
        where: {
            schoolId,
            academicYearId,
            isActive: true,
            OR: [
                { groupId },
                ...(groupInfo.classId ? [{
                    classId: groupInfo.classId,
                    OR: [
                        { sectionId: groupInfo.sectionId },
                        { sectionId: null }
                    ]
                }] : [])
            ]
        },
        include: {
            subject: true,
            teacher: { select: { id: true, user: { select: { name: true } } } },
        },
    });

    console.log("Assignments length:", subjectAssignments.length);
    console.log("Assignments:", JSON.stringify(subjectAssignments, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
