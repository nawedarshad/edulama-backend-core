import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Prisma, AcademicYearStatus } from '@prisma/client';

import { BulkCreateSectionDto } from './dto/bulk-create-section.dto';

@Injectable()
export class SectionService {
    private readonly logger = new Logger(SectionService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, classId?: number, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        const where: Prisma.SectionWhereInput = {
            schoolId,
        };

        if (classId) {
            where.classId = classId;
        }

        const [sections, total] = await Promise.all([
            this.prisma.section.findMany({
                where,
                include: {
                    classTeacher: {
                        include: {
                            teacher: {
                                include: {
                                    user: {
                                        include: {
                                            authIdentities: {
                                                where: { type: 'EMAIL' },
                                                select: { value: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    name: 'asc',
                },
                skip,
                take: limit,
            }),
            this.prisma.section.count({ where }),
        ]);

        // Transform
        const data = sections.map((section) => ({
            id: section.id,
            name: section.name,
            classId: section.classId,
            capacity: section.capacity,
            order: section.order,
            description: section.description,
            stream: section.stream,
            classTeacher: section.classTeacher?.teacher?.user
                ? {
                    id: section.classTeacher.id,
                    teacher: {
                        id: section.classTeacher.teacher.user.id,
                        name: section.classTeacher.teacher.user.name,
                        email: section.classTeacher.teacher.user.authIdentities[0]?.value || '',
                    },
                }
                : undefined,
        }));

        return {
            data,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
            }
        };
    }

    async create(schoolId: number, dto: CreateSectionDto) {
        // Validate Class
        const cls = await this.prisma.class.findFirst({
            where: { id: dto.classId, schoolId },
            include: { sections: true },
        });

        if (!cls) {
            throw new NotFoundException('Class not found');
        }

        if (cls.capacity) {
            const currentTotal = cls.sections.reduce((sum, sec) => sum + (sec.capacity || 0), 0);
            if (currentTotal + (dto.capacity || 0) > cls.capacity) {
                throw new BadRequestException(
                    `Total section capacity (${currentTotal + (dto.capacity || 0)}) exceeds class limit (${cls.capacity})`
                );
            }
        }

        // Get active academic year
        const activeAcademicYear = await this.prisma.academicYear.findFirst({
            where: {
                schoolId,
                status: AcademicYearStatus.ACTIVE,
            },
        });

        if (!activeAcademicYear) {
            throw new BadRequestException('No active academic year found');
        }

        try {
            const section = await this.prisma.section.create({
                data: {
                    name: dto.name,
                    classId: dto.classId,
                    capacity: dto.capacity,
                    order: dto.order,
                    description: dto.description,
                    stream: dto.stream,
                    schoolId,
                    academicYearId: activeAcademicYear.id,
                },
            });
            return section;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Section with this name already exists for this class');
            }
            this.logger.error('Error creating section', error);
            throw new InternalServerErrorException('Failed to create section');
        }
    }

    async findOne(schoolId: number, id: number) {
        const section = await this.prisma.section.findFirst({
            where: { id, schoolId },
            include: {
                classTeacher: {
                    include: {
                        teacher: {
                            include: {
                                user: {
                                    include: {
                                        authIdentities: {
                                            where: { type: 'EMAIL' },
                                            select: { value: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!section) {
            throw new NotFoundException(`Section with ID ${id} not found`);
        }

        const sec = section;

        return {
            id: sec.id,
            name: sec.name,
            classId: sec.classId,
            capacity: sec.capacity,
            order: sec.order,
            description: sec.description,
            stream: sec.stream,
            classTeacher: sec.classTeacher?.teacher?.user
                ? {
                    id: sec.classTeacher.id,
                    teacher: {
                        id: sec.classTeacher.teacher.user.id,
                        name: sec.classTeacher.teacher.user.name,
                        email: sec.classTeacher.teacher.user.authIdentities[0]?.value || '',
                    },
                }
                : undefined,
        };
    }

    async update(schoolId: number, id: number, dto: UpdateSectionDto) {
        const section = await this.prisma.section.findFirst({
            where: { id, schoolId },
        });

        if (!section) {
            throw new NotFoundException(`Section with ID ${id} not found`);
        }

        // Capacity Validation
        if (dto.capacity !== undefined) {
            const cls = await this.prisma.class.findFirst({
                where: { id: dto.classId || section.classId, schoolId },
                include: { sections: true },
            });

            if (cls && cls.capacity) {
                const otherSectionsTotal = cls.sections
                    .filter(s => s.id !== id)
                    .reduce((sum, s) => sum + (s.capacity || 0), 0);

                if (otherSectionsTotal + dto.capacity > cls.capacity) {
                    throw new BadRequestException(
                        `Total section capacity (${otherSectionsTotal + dto.capacity}) exceeds class limit (${cls.capacity})`
                    );
                }
            }
        }

        try {
            return await this.prisma.section.update({
                where: { id },
                data: {
                    name: dto.name,
                    classId: dto.classId,
                    capacity: dto.capacity,
                    order: dto.order,
                    description: dto.description,
                    stream: dto.stream,
                },
            });
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Section with this name already exists for this class');
            }
            this.logger.error('Error updating section', error);
            throw new InternalServerErrorException('Failed to update section');
        }
    }

    async remove(schoolId: number, id: number) {
        const section = await this.prisma.section.findFirst({
            where: { id, schoolId },
            include: {
                _count: {
                    select: {
                        StudentProfile: true
                    }
                }
            }
        });

        if (!section) {
            throw new NotFoundException(`Section with ID ${id} not found`);
        }

        // Safe Delete Checks
        if (section._count.StudentProfile > 0) {
            throw new BadRequestException(`Cannot delete section. It has ${section._count.StudentProfile} students assigned.`);
        }

        try {
            await this.prisma.section.delete({
                where: { id },
            });
            return { message: 'Section deleted successfully' };
        } catch (error) {
            this.logger.error('Error deleting section', error);
            throw new InternalServerErrorException('Failed to delete section');
        }
    }

    async createBulk(schoolId: number, dto: BulkCreateSectionDto) {
        // Get active academic year
        const activeAcademicYear = await this.prisma.academicYear.findFirst({
            where: {
                schoolId,
                status: AcademicYearStatus.ACTIVE,
            },
        });

        if (!activeAcademicYear) {
            throw new BadRequestException('No active academic year found');
        }

        // Validate all classIds belong to school (optional optimization: fetch all relevant classIds in one query)
        // For simplicity and safety in transaction, we rely on individual constraints or simple pre-check.
        // Let's do a simple pre-check for existence of classes if needed, 
        // but foreign key constraints will handle invalid classIds. 
        // However, we must ensure class belongs to school. 

        // Strategy: We won't check every single class ownership in a loop to avoid N queries.
        // We will assume if they pass FK constraint it's okay, BUT standard Multi-tenant rule:
        // Malicious user could try to add section to class of another school.
        // So we MUST verify class ownership.

        const classIds = [...new Set(dto.sections.map(s => s.classId))];
        const validClasses = await this.prisma.class.count({
            where: {
                id: { in: classIds },
                schoolId
            }
        });

        if (validClasses !== classIds.length) {
            throw new BadRequestException('One or more Class IDs are invalid or do not belong to this school');
        }

        // Validate Capacity for each class involved
        // We fetch all involved classes with their sections
        const classes = await this.prisma.class.findMany({
            where: { id: { in: classIds }, schoolId },
            include: { sections: true },
        });

        for (const cls of classes) {
            if (cls.capacity) {
                const currentTotal = cls.sections.reduce((sum, s) => sum + (s.capacity || 0), 0);
                // Sum of NEW sections for THIS class
                const newSectionsTotal = dto.sections
                    .filter(s => s.classId === cls.id)
                    .reduce((sum, s) => sum + (s.capacity || 0), 0);

                if (currentTotal + newSectionsTotal > cls.capacity) {
                    throw new BadRequestException(
                        `Bulk upload exceeds capacity for Class '${cls.name}'. Limit: ${cls.capacity}, Current: ${currentTotal}, Adding: ${newSectionsTotal}`
                    );
                }
            }
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                for (const secDto of dto.sections) {
                    await tx.section.create({
                        data: {
                            name: secDto.name,
                            classId: secDto.classId,
                            capacity: secDto.capacity,
                            order: secDto.order,
                            description: secDto.description,
                            stream: secDto.stream,
                            schoolId,
                            academicYearId: activeAcademicYear.id,
                        },
                    });
                }
            });
            return { message: `Successfully created ${dto.sections.length} sections` };
        } catch (error) {
            this.logger.error('Bulk create section error', error);
            if (error.code === 'P2002') {
                throw new BadRequestException('One or more sections already exist (duplicate name in class)');
            }
            throw new InternalServerErrorException('Failed to process bulk creation');
        }
    }

    getTemplate() {
        return [
            {
                name: "Section A",
                classId: 101,
                capacity: 30,
                order: 1,
                description: "Science Stream",
                stream: "SCIENCE"
            },
            {
                name: "Section B",
                classId: 101,
                capacity: 35,
                order: 2,
                description: "Commerce Stream",
                stream: "COMMERCE"
            }
        ];
    }
}
