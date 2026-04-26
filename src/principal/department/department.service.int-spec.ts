import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentService } from './department.service';
import { PrismaService } from '../../prisma/prisma.service';
import { cleanDatabase } from '../../../test/integration-utils';
import { DepartmentType } from '@prisma/client';
import { NotFoundException, ConflictException } from '@nestjs/common';

import { CacheModule } from '@nestjs/cache-manager';

describe('DepartmentService (Integration)', () => {
    let service: DepartmentService;
    let prisma: PrismaService;

    let testSchool: any;
    let testUser: any;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                CacheModule.register(),
            ],
            providers: [DepartmentService, PrismaService],
        }).compile();

        service = module.get<DepartmentService>(DepartmentService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    beforeEach(async () => {
        await cleanDatabase();

        // Setup base fixtures
        testSchool = await prisma.school.create({
            data: {
                name: 'Test School',
                code: 'TS01',
                subdomain: 'test-school',
            },
        });

        testUser = await prisma.user.create({
            data: {
                name: 'Test Admin',
                schoolId: testSchool.id,
            },
        });
    });

    afterAll(async () => {
        await cleanDatabase();
        await prisma.$disconnect();
    });

    describe('create', () => {
        it('should persist a department in the database', async () => {
            const dto = {
                code: 'SCI',
                name: ' Science ', // Test trimming
                type: DepartmentType.ACADEMIC,
                headId: testUser.id,
            };

            const result = await service.create(testSchool.id, dto);

            // DB Verification
            const dbRecord = await prisma.department.findUnique({
                where: { id: result.id },
            });

            expect(dbRecord).toBeDefined();
            expect(dbRecord?.code).toBe('SCI');
            expect(dbRecord?.name).toBe('Science'); // Trimmed
            expect(dbRecord?.schoolId).toBe(testSchool.id);
        });

        it('should enforce unique code per school constraint', async () => {
            await prisma.department.create({
                data: {
                    code: 'DUPE',
                    name: 'Duplicate',
                    schoolId: testSchool.id,
                },
            });

            const dto = { code: 'DUPE', name: 'Another One' };

            await expect(service.create(testSchool.id, dto)).rejects.toThrow(ConflictException);
        });

        it('should allow same code in different schools', async () => {
            const school2 = await prisma.school.create({
                data: { name: 'School 2', code: 'S2', subdomain: 's2' },
            });

            await prisma.department.create({
                data: { code: 'SAME', name: 'Dept 1', schoolId: testSchool.id },
            });

            const result = await service.create(school2.id, { code: 'SAME', name: 'Dept 2' });
            expect(result.id).toBeDefined();
        });
    });

    describe('Membership Integration', () => {
        it('should verify foreign key constraint for members', async () => {
            const dept = await prisma.department.create({
                data: { code: 'MEM', name: 'Membership', schoolId: testSchool.id },
            });

            // Try to add a non-existent user
            await expect(service.addMember(testSchool.id, dept.id, { userId: 99999, role: 'TEACHER' }))
                .rejects.toThrow(NotFoundException);
        });

        it('should prevent adding user from different school to department', async () => {
            const school2 = await prisma.school.create({
                data: { name: 'School 2', code: 'S22', subdomain: 's22' },
            });
            const user2 = await prisma.user.create({
                data: { name: 'Foreign User', schoolId: school2.id },
            });
            const dept = await prisma.department.create({
                data: { code: 'MEM', name: 'Membership', schoolId: testSchool.id },
            });

            await expect(service.addMember(testSchool.id, dept.id, { userId: user2.id, role: 'TEACHER' }))
                .rejects.toThrow(NotFoundException);
        });

        it('should successfully add and retrieve members from DB', async () => {
            const dept = await prisma.department.create({
                data: { code: 'BIOL', name: 'Biology', schoolId: testSchool.id },
            });

            await service.addMember(testSchool.id, dept.id, { userId: testUser.id, role: 'HOD' });

            const { data: members } = await (service.getMembers(testSchool.id, dept.id, {}) as any);
            expect(members).toHaveLength(1);
            expect(members[0].userId).toBe(testUser.id);
            expect(members[0].role).toBe('HOD');
        });
    });

    describe('Bulk Operations Integration', () => {
        it('should assign multiple existing subjects to department', async () => {
            const dept = await prisma.department.create({
                data: { code: 'BULK', name: 'Bulk Dept', schoolId: testSchool.id },
            });

            const s1 = await prisma.subject.create({
                data: { name: 'Sub 1', code: 'S1', schoolId: testSchool.id },
            });
            const s2 = await prisma.subject.create({
                data: { name: 'Sub 2', code: 'S2', schoolId: testSchool.id },
            });

            const result = await service.assignSubjectsBulk(testSchool.id, dept.id, {
                subjectIds: [s1.id, s2.id],
            });

            expect(result.count).toBe(2);

            const updatedS1 = await prisma.subject.findUnique({ where: { id: s1.id } });
            expect(updatedS1?.departmentId).toBe(dept.id);
        });

        it('should move subjects from one department to another in bulk', async () => {
            const deptA = await prisma.department.create({ data: { code: 'DA', name: 'Dept A', schoolId: testSchool.id } });
            const deptB = await prisma.department.create({ data: { code: 'DB', name: 'Dept B', schoolId: testSchool.id } });

            const s1 = await prisma.subject.create({ data: { name: 'S1', code: 'S1', schoolId: testSchool.id, departmentId: deptA.id } });

            // Move to Dept B
            await service.assignSubjectsBulk(testSchool.id, deptB.id, { subjectIds: [s1.id] });

            const check = await prisma.subject.findUnique({ where: { id: s1.id } });
            expect(check?.departmentId).toBe(deptB.id);
        });
    });

    describe('Search, Filtering, and Guards', () => {
        it('should correctly filter and search departments in the DB', async () => {
            await prisma.department.createMany({
                data: [
                    { name: 'Physics', code: 'PHY', type: 'ACADEMIC', schoolId: testSchool.id },
                    { name: 'Finance', code: 'FIN', type: 'ADMINISTRATIVE', schoolId: testSchool.id },
                    { name: 'Physical Ed', code: 'PED', type: 'ACADEMIC', schoolId: testSchool.id },
                ],
            });

            // Search for "Phys"
            const searchResult = await (service.findAll(testSchool.id, { search: 'Phys' }) as any);
            expect(searchResult.meta.total).toBe(2); // Physics and Physical Ed

            // Filter by Administrative
            const filterResult = await (service.findAll(testSchool.id, { type: 'ADMINISTRATIVE' as any }) as any);
            expect(filterResult.meta.total).toBe(1);
            expect(filterResult.data[0].name).toBe('Finance');
        });

        it('should enforce deletion guards when members or subjects exist', async () => {
            const dept = await prisma.department.create({ data: { code: 'GUARD', name: 'Protected', schoolId: testSchool.id } });

            // 1. Block by Member
            await prisma.departmentMember.create({ data: { departmentId: dept.id, userId: testUser.id } });
            await expect(service.remove(testSchool.id, dept.id)).rejects.toThrow(/Cannot delete.*members/);

            // Cleanup member
            await prisma.departmentMember.deleteMany({ where: { departmentId: dept.id } });

            // 2. Block by Subject
            await prisma.subject.create({ data: { name: 'Blocker', code: 'BLK', schoolId: testSchool.id, departmentId: dept.id } });
            await expect(service.remove(testSchool.id, dept.id)).rejects.toThrow(/Cannot delete.*subjects/);
        });

        it('should automatically delete departments when a school is purged (Cascade)', async () => {
            const dept = await prisma.department.create({ data: { code: 'GONER', name: 'To Be Deleted', schoolId: testSchool.id } });

            // Delete school
            await prisma.school.delete({ where: { id: testSchool.id } });

            // Verify department is gone
            const check = await prisma.department.findUnique({ where: { id: dept.id } });
            expect(check).toBeNull();
        });
    });
});
