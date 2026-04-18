import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('--- Attendance Records for Today ---');
    const records = await prisma.attendance.findMany({
        where: {
            session: {
                date: {
                    gte: today
                }
            }
        },
        include: {
            session: true,
            studentProfile: true
        }
    });
    
    console.log(`Found ${records.length} records`);
    records.forEach(r => {
        console.log(`[${r.status}] Student: ${r.studentProfile?.fullName} | Date: ${r.session.date.toISOString()} | Class: ${r.session.classId}`);
    });

    console.log('\n--- Sessions for Today ---');
    const sessions = await prisma.attendanceSession.findMany({
        where: {
            date: {
                gte: today
            }
        }
    });
    console.log(`Found ${sessions.length} sessions`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
