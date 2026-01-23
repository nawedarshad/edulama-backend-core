import { PrismaClient, AnnouncementStatus, AudienceType } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    let output = `Debug Teacher Announcement Query\n`;

    // 1. Find a Teacher
    const teacherProfile = await prisma.teacherProfile.findFirst({
        include: { user: true }
    });

    if (!teacherProfile) {
        console.log("No teacher profile found!");
        return;
    }

    const schoolId = teacherProfile.schoolId;
    const userId = teacherProfile.userId;
    const teacherId = teacherProfile.id;
    const roleId = teacherProfile.user.roleId;

    output += `Testing with Teacher: ID=${teacherId}, UserID=${userId}, SchoolId=${schoolId}, RoleId=${roleId}\n`;

    // 2. Run Query
    const where: any = {
        schoolId,
        status: AnnouncementStatus.PUBLISHED,
        deletedAt: null,
        audiences: {
            some: {
                OR: [
                    { type: AudienceType.ALL_SCHOOL },
                    { type: AudienceType.TEACHER },
                    {
                        type: AudienceType.STAFF,
                        OR: [
                            { staffId: null },
                            { staffId: teacherId }
                        ]
                    },
                    {
                        type: AudienceType.ROLE,
                        roleId: roleId
                    }
                ]
            }
        }
    };

    const data = await prisma.announcement.findMany({
        where,
        take: 10,
        orderBy: { priority: 'desc' },
        include: {
            attachments: true,
            audiences: true,
            createdBy: {
                select: { id: true, name: true, photo: true }
            }
        }
    });

    output += `Found ${data.length} announcements.\n`;

    data.forEach(a => {
        output += `[${a.id}] ${a.title} (Emergency: ${a.isEmergency}) | Voice: ${a.voiceAudioUrl || 'None'} (${a.voiceDuration || 0}s)\n`;
        output += `   Audiences: ${JSON.stringify(a.audiences)}\n`;
    });

    fs.writeFileSync('debug_teacher_output.txt', output);
    console.log('Output written to debug_teacher_output.txt');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
