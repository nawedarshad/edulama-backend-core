import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';
import * as dotenv from 'dotenv';
import { cleanDatabase } from '../integration-utils';

dotenv.config();

const prisma = new PrismaClient();

async function runPerformanceTest() {
    console.log('\n================================================');
    console.log('🚀 DB PERFORMANCE & STRESS TEST: DEPARTMENT MODULE');
    console.log('================================================\n');

    try {
        console.log('🧹 Cleaning database...');
        await cleanDatabase();

        // --- SETUP FIXTURES ---
        console.log('⚙️  Setting up test school and users...');
        const timestamp = Date.now();
        const school = await prisma.school.create({
            data: { 
                name: `Performance Academy ${timestamp}`, 
                code: `PERF_${timestamp}`, 
                subdomain: `perf-${timestamp}` 
            }
        });

        const userCount = 500;
        console.log(`👥 Creating ${userCount} dummy users...`);
        // Efficient way to create many users
        const userData = Array.from({ length: userCount }).map((_, i) => ({
            name: `Staff Member ${i}`,
            schoolId: school.id
        }));
        await prisma.user.createMany({ data: userData });
        const users = await prisma.user.findMany({ where: { schoolId: school.id }, select: { id: true } });

        // --- SCENARIO 1: MASS INSERTION ---
        const deptCount = 1000;
        console.log(`\n📦 SCENARIO 1: Inserting ${deptCount} Departments...`);
        const startInsert = performance.now();
        await prisma.department.createMany({
            data: Array.from({ length: deptCount }).map((_, i) => ({
                name: `Department of ${i}`,
                code: `DEPT_${i}`,
                schoolId: school.id,
                type: 'ACADEMIC'
            }))
        });
        const endInsert = performance.now();
        const insertDuration = endInsert - startInsert;
        console.log(`✅ Result: ${deptCount} records created in ${insertDuration.toFixed(2)}ms`);
        console.log(`⚡ Throughput: ${(deptCount / (insertDuration / 1000)).toFixed(0)} records/sec`);

        // --- SCENARIO 2: COMPLEX SEARCH LATENCY ---
        console.log(`\n🔍 SCENARIO 2: Search Latency (Searching 50 times in ${deptCount} records)...`);
        const searchLatencies: number[] = [];
        for (let i = 0; i < 50; i++) {
            const searchTerm = Math.floor(Math.random() * deptCount).toString();
            const start = performance.now();
            await prisma.department.findMany({
                where: {
                    schoolId: school.id,
                    name: { contains: searchTerm, mode: 'insensitive' }
                }
            });
            searchLatencies.push(performance.now() - start);
        }
        
        searchLatencies.sort((a, b) => a - b);
        const avgSearch = searchLatencies.reduce((a, b) => a + b) / searchLatencies.length;
        const p95Search = searchLatencies[Math.floor(searchLatencies.length * 0.95)];
        
        console.log(`✅ Avg Latency: ${avgSearch.toFixed(2)}ms`);
        console.log(`✅ P95 Latency: ${p95Search.toFixed(2)}ms`);

        // --- SCENARIO 3: CONCURRENCY STRESS ---
        const concurrentRequests = 30;
        console.log(`\n🌪️  SCENARIO 3: Concurrency Stress (${concurrentRequests} simultaneous reads)...`);
        const startConcur = performance.now();
        await Promise.all(
            Array.from({ length: concurrentRequests }).map(() => 
                prisma.department.findMany({
                    where: { schoolId: school.id },
                    include: { _count: { select: { members: true, subjects: true } } }
                })
            )
        );
        const endConcur = performance.now();
        console.log(`✅ Handled ${concurrentRequests} complex parallel queries in ${(endConcur - startConcur).toFixed(2)}ms`);

        // --- SCENARIO 4: BULK THROUGHPUT ---
        const bulkCount = 200;
        console.log(`\n🚜 SCENARIO 4: Bulk Member Addition (${bulkCount} members in one go)...`);
        const targetDept = await prisma.department.findFirst({ where: { schoolId: school.id } });
        if(targetDept) {
            const startBulk = performance.now();
            await prisma.departmentMember.createMany({
                data: users.slice(0, bulkCount).map(u => ({
                    departmentId: targetDept.id,
                    userId: u.id,
                    role: 'TEACHER'
                }))
            });
            const endBulk = performance.now();
            console.log(`✅ Bulk added ${bulkCount} members in ${(endBulk - startBulk).toFixed(2)}ms`);
        }

        console.log('\n================================================');
        console.log('⭐ PERFORMANCE TEST COMPLETE');
        console.log('================================================\n');

    } catch (error) {
        console.error('❌ Performance test failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runPerformanceTest();
