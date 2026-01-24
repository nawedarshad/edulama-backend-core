const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Fetching first 5 students...');
    try {
        const students = await prisma.studentProfile.findMany({
            take: 5,
            select: {
                id: true,
                fullName: true,
                admissionNo: true,
                schoolId: true
            }
        });
        console.log('Students:', JSON.stringify(students, null, 2));
    } catch (e) {
        console.error('Error fetching students:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
