import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Check Schools
    const schools = await prisma.school.findMany();
    console.log(`Total Schools: ${schools.length}`);
    schools.forEach(s => console.log(`School: [${s.id}] ${s.name}`));

    if (schools.length === 0) return;

    // Check Academic Years
    const years = await prisma.academicYear.findMany();
    console.log(`Total Academic Years: ${years.length}`);
    years.forEach(y => console.log(`Year: [${y.id}] ${y.name} (School: ${y.schoolId}, Active: ${y.isActive})`));

    // Check Users
    const users = await prisma.user.count();
    console.log(`Total Users: ${users}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
