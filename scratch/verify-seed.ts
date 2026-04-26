import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const notices = await prisma.notice.count({ where: { schoolId } });
    const leaveTypes = await prisma.leaveType.count({ where: { schoolId } });
    const leaveRequests = await prisma.leaveRequest.count({ where: { schoolId } });

    console.log({
        notices,
        leaveTypes,
        leaveRequests
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
