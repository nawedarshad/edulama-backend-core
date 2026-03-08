import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AcademicGroupType } from '@prisma/client';

@Injectable()
export class AcademicGroupService {
    private readonly logger = new Logger(AcademicGroupService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, type?: AcademicGroupType) {
        return this.prisma.academicGroup.findMany({
            where: {
                schoolId,
                ...(type && { type }),
            },
            include: {
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        return this.prisma.academicGroup.findFirst({
            where: { id, schoolId },
            include: {
                class: true,
                section: true,
            },
        });
    }

    // This method will be used to sync/ensure groups exist for Schools (Sections -> Groups)
    async syncSchoolGroups(schoolId: number) {
        const sections = await this.prisma.section.findMany({
            where: { schoolId },
            include: { class: true },
        });
        for (const section of sections) {
            await this.getGroupForSection(schoolId, section.id);
        }

        // Also sync classes that don't use sections (Coaching / College)
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            select: { type: true }
        });

        if (school && (school.type === 'COACHING' || school.type === 'COLLEGE')) {
            const classes = await this.prisma.class.findMany({
                where: { schoolId },
                include: { sections: true }
            });

            for (const cls of classes) {
                if (cls.sections.length === 0) {
                    await this.getGroupForClass(schoolId, cls.id, school.type);
                }
            }
        }
    }

    // Simplified sync: Find or create group for section
    async getGroupForSection(schoolId: number, sectionId: number) {
        let group = await this.prisma.academicGroup.findFirst({
            where: { schoolId, sectionId },
        });

        if (!group) {
            const section = await this.prisma.section.findUnique({
                where: { id: sectionId },
                include: { class: true },
            });
            if (section) {
                group = await this.prisma.academicGroup.create({
                    data: {
                        schoolId,
                        sectionId,
                        classId: section.classId,
                        name: `${section.class.name} ${section.name}`,
                        type: 'CLASS_SECTION',
                    },
                });
            }
        }
        return group;
    }

    async getGroupForClass(schoolId: number, classId: number, schoolType: string) {
        let group = await this.prisma.academicGroup.findFirst({
            where: { schoolId, classId, sectionId: null },
        });

        if (!group) {
            const cls = await this.prisma.class.findUnique({
                where: { id: classId },
            });
            if (cls) {
                group = await this.prisma.academicGroup.create({
                    data: {
                        schoolId,
                        classId,
                        name: cls.name,
                        type: schoolType === 'COACHING' ? 'COACHING_BATCH' : 'COLLEGE_CLASS',
                    },
                });
            }
        }
        return group;
    }
    async update(schoolId: number, id: number, data: any) {
        return this.prisma.academicGroup.update({
            where: { id, schoolId },
            data,
        });
    }
}
