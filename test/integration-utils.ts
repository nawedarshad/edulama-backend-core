import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to clean production database');
    }

    const tablenames = await prisma.$queryRaw<
        Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma_migrations'`;

    const tables = tablenames
        .map(({ tablename }) => `"${tablename}"`)
        .join(', ');

    try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
        console.error('Error cleaning database:', error);
    }
}
