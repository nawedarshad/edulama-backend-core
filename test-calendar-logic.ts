
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check(startStr: string, endStr: string) {
    const schoolId = 2; // From previous dump
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);

    const years = await prisma.academicYear.findMany({
        where: {
            schoolId,
            startDate: { lte: endDate }, // Year starts before Query ends
            endDate: { gte: startDate }, // Year ends after Query starts
        },
    });

    const fs = require('fs');
    fs.appendFileSync('debug_logic.txt', `Query [${startStr} to ${endStr}]: Found ${years.length} years.\n`);
}

async function main() {
    require('fs').writeFileSync('debug_logic.txt', ''); // Clear file
    console.log("Testing IN-RANGE (Jan 2026)...");
    await check('2026-01-01', '2026-01-31');

    console.log("Testing OUT-OF-RANGE (April 2026)...");
    await check('2026-04-01', '2026-04-30');

    console.log("Testing EDGE (March 2025)...");
    await check('2025-03-01', '2025-03-31');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
