const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Leave Requests ---');
    try {
        const leaves = await prisma.leaveRequest.findMany({
            take: 10,
            select: { id: true, status: true, applicantId: true, startDate: true }
        });
        console.log('Leave Requests:', JSON.stringify(leaves, null, 2));

        const pendingCount = await prisma.leaveRequest.count({
            where: { status: 'PENDING' }
        });
        console.log('Total PENDING Leave Requests:', pendingCount);

    } catch (e) {
        console.error('Error fetching leaves:', e);
    }

    console.log('\n--- Checking Staff Attendance ---');
    try {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));

        const staffAttendance = await prisma.staffAttendance.findMany({
            where: {
                date: { gte: startOfDay }
            },
            take: 10
        });
        console.log('Staff Attendance Today:', JSON.stringify(staffAttendance, null, 2));
    } catch (e) {
        console.error('Error fetching staff attendance:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
