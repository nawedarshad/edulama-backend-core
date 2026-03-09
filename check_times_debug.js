const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        // Check TimeSlot raw values
        const slots = await prisma.timeSlot.findMany({ take: 5, include: { period: true } });
        console.log("=== TimeSlot rows ===");
        for (const s of slots) {
            console.log(`  id=${s.id} startTime=${JSON.stringify(s.startTime)} endTime=${JSON.stringify(s.endTime)}`);
            if (s.period) {
                console.log(`    period.startTime=${JSON.stringify(s.period.startTime)} period.endTime=${JSON.stringify(s.period.endTime)}`);
            }
        }

        // Check TimetableEntry + timeSlot
        const entries = await prisma.timetableEntry.findMany({ take: 5, include: { timeSlot: { include: { period: true } } } });
        console.log("\n=== TimetableEntry rows ===");
        for (const e of entries) {
            console.log(`  entry.id=${e.id} day=${e.day}`);
            console.log(`    timeSlot.startTime=${JSON.stringify(e.timeSlot?.startTime)} timeSlot.endTime=${JSON.stringify(e.timeSlot?.endTime)}`);
            if (e.timeSlot?.period) {
                console.log(`    period.startTime=${JSON.stringify(e.timeSlot.period.startTime)} period.endTime=${JSON.stringify(e.timeSlot.period.endTime)}`);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
