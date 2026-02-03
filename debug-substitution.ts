import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const LOG_FILE = 'debug-output.txt';

function log(msg: string) {
    try { fs.appendFileSync(LOG_FILE, msg + '\n'); } catch (e) { }
    console.log(msg);
}

async function main() {
    fs.writeFileSync(LOG_FILE, 'Targeted Status Check (School 2)...\n');

    try {
        const schoolId = 2; // DEMO PUBLIC SCHOOL
        const ayId = 1;     // 2025-2026

        const today = new Date();
        // Hardcode Tuesday if needed based on previous run, but let's use dynamic
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        // Just check all days for thoroughness or just today
        const dateString = today.toISOString().split('T')[0];
        const d = new Date(dateString);
        const dayName = days[d.getUTCDay()];

        log(`Checking entries for School 2, Year 1, Day: ${dayName}`);

        const entries = await prisma.timetableEntry.findMany({
            where: {
                schoolId,
                academicYearId: ayId,
                day: dayName as any
            },
            include: { teacher: { include: { user: true } } }
        });

        log(`Found ${entries.length} entries for ${dayName}.`);

        const statusCounts: Record<string, number> = {};

        entries.forEach(e => {
            log(`[${e.id}] ${e.teacher.user.name}: ${e.status}`);
            statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
        });

        log('Status Summary:');
        console.table(statusCounts);
        log(JSON.stringify(statusCounts));

    } catch (e: any) {
        log('ERROR: ' + e.message);
    }
}

main().finally(() => prisma.$disconnect());
