import { cleanDatabase } from '../integration-utils';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

async function cleanup() {
    console.log('🧹 Cleaning up all test/performance data...');
    try {
        await cleanDatabase();
        console.log('✅ Base tables cleaned successfully.');
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        const prisma = new PrismaClient();
        await prisma.$disconnect();
        process.exit(0);
    }
}

cleanup();
