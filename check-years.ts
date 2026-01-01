
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const years = await prisma.academicYear.findMany({
        include: { school: true }
    });
    console.log("Writing to debug_years.json...");
    fs.writeFileSync('debug_years.json', JSON.stringify(years, null, 2));
    console.log("Done.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
