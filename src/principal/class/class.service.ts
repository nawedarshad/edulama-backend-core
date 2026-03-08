import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { AssignClassTeacherDto } from './dto/assign-class-teacher.dto';
import { AssignHeadTeacherDto } from './dto/assign-head-teacher.dto';
import { AcademicYearStatus } from '@prisma/client';

import { BulkCreateClassDto } from './dto/bulk-create-class.dto';
import { CreateClassWithSectionsDto } from './dto/create-class-with-sections.dto';

@Injectable()
export class ClassService {
    private readonly logger = new Logger(ClassService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, page: number = 1, limit: number = 10, academicYearId?: number) {
        this.logger.log(`Fetching classes for school ${schoolId} (Page: ${page}, Limit: ${limit}, Year: ${academicYearId})`);
        const skip = (page - 1) * limit;

        const where: any = { schoolId };
        if (academicYearId) {
            where.academicYearId = academicYearId;
        }

        const [classes, total] = await Promise.all([
            this.prisma.class.findMany({
                where,
                include: {
                    schedule: { select: { id: true, name: true } },
                    headTeacher: {
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
                    sections: {
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
                            ClassSubject: {
                                include: {
                                    subject: true
                                }
                            },
                            academicAssignments: {
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
                    },
                    academicAssignments: {
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
            this.prisma.class.count({ where: { schoolId } }),
        ]);

        this.logger.log(`Found ${total} classes for school ${schoolId}`);

        // Transform the data to match the frontend interface
        const data = classes.map((cls) => ({
            id: cls.id,
            name: cls.name,
            stage: cls.stage,
            capacity: cls.capacity ?? cls.sections.reduce((sum, section) => sum + (section.capacity || 0), 0),
            order: cls.order,
            description: cls.description,
            headTeacher: cls.headTeacher?.teacher?.user
                ? {
                    id: cls.headTeacher.id,
                    teacher: {
                        id: cls.headTeacher.teacher.id,
                        name: cls.headTeacher.teacher.user.name,
                        email: cls.headTeacher.teacher.user.authIdentities[0]?.value || '',
                    },
                }
                : undefined,
            teacherAssignments: cls.academicAssignments?.map(assignment => ({
                id: assignment.id,
                role: assignment.role,
                teacher: {
                    id: assignment.teacher.id,
                    name: assignment.teacher.user.name,
                    email: assignment.teacher.user.authIdentities[0]?.value || '',
                }
            })) || [],
            sections: cls.sections.map((section) => ({
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
                            id: section.classTeacher.teacher.id,
                            name: section.classTeacher.teacher.user.name,
                            email: section.classTeacher.teacher.user.authIdentities[0]?.value || '',
                        },
                    }
                    : undefined,
                teacherAssignments: section.academicAssignments?.map(assignment => ({
                    id: assignment.id,
                    role: assignment.role,
                    teacher: {
                        id: assignment.teacher.id,
                        name: assignment.teacher.user.name,
                        email: assignment.teacher.user.authIdentities[0]?.value || '',
                    }
                })) || [],
                subjects: section.ClassSubject?.map(cs => ({
                    id: cs.subject.id,
                    name: cs.subject.name,
                    code: cs.subject.code,
                    type: cs.type,
                    credits: cs.credits
                })) || [],
            })),
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

    async findOne(schoolId: number, id: number) {
        const cls = await this.prisma.class.findFirst({
            where: { id, schoolId },
            include: {
                sections: {
                    include: {
                        ClassSubject: {
                            include: {
                                subject: true
                            }
                        },
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
                        academicAssignments: {
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
                    }
                },
                headTeacher: {
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
                academicAssignments: {
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

        if (!cls) {
            this.logger.warn(`Class ${id} not found in school ${schoolId}`);
            throw new NotFoundException(`Class with ID ${id} not found`);
        }

        const c = cls;

        return {
            ...c,
            capacity: c.capacity ?? c.sections.reduce((sum, section) => sum + (section.capacity || 0), 0),
            headTeacher: c.headTeacher?.teacher?.user
                ? {
                    id: c.headTeacher.id,
                    teacher: {
                        id: c.headTeacher.teacher.id,
                        name: c.headTeacher.teacher.user.name,
                        email: c.headTeacher.teacher.user.authIdentities[0]?.value || '',
                    },
                }
                : undefined,
            teacherAssignments: c.academicAssignments?.map(assignment => ({
                id: assignment.id,
                role: assignment.role,
                teacher: {
                    id: assignment.teacher.id,
                    name: assignment.teacher.user.name,
                    email: assignment.teacher.user.authIdentities[0]?.value || '',
                }
            })) || [],
        };
    }

    async create(schoolId: number, dto: CreateClassDto) {
        this.logger.log(`Creating class '${dto.name}' for school ${schoolId}`);

        try {
            const newClass = await this.prisma.class.create({
                data: {
                    name: dto.name,
                    stage: dto.stage,
                    capacity: dto.capacity,
                    order: dto.order,
                    description: dto.description,
                    scheduleId: dto.scheduleId,
                    schoolId,
                    // academicYearId removed - Classes are global 
                },
            });
            this.logger.log(`Class created: ${newClass.id}`);
            return newClass;
        } catch (error) {
            if (error.code === 'P2002') {
                this.logger.warn(`Duplicate class name '${dto.name}' in school ${schoolId}`);
                throw new BadRequestException('Class with this name already exists for this school');
            }
            this.logger.error('Error creating class', error.stack);
            throw new InternalServerErrorException('Failed to create class');
        }
    }

    async createWithSections(schoolId: number, dto: CreateClassWithSectionsDto) {
        this.logger.log(`Creating class '${dto.name}' with ${dto.sections.length} sections for school ${schoolId}`);

        // 1. Fetch school type for validation
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            select: { type: true }
        });

        if (!school) {
            throw new NotFoundException(`School with ID ${schoolId} not found`);
        }

        // 2. Validate sections based on school type
        if (school.type === 'SCHOOL' && dto.sections.length === 0) {
            throw new BadRequestException('A class must have at least one section in a school institution.');
        }

        // 3. Case-insensitive duplicate section name check
        const sectionNames = dto.sections.map(s => s.name.toLowerCase().trim());
        const hasDuplicates = sectionNames.some((name, index) => sectionNames.indexOf(name) !== index);
        if (hasDuplicates) {
            throw new BadRequestException('Duplicate section names are not allowed.');
        }

        // 4. Validate schedule ownership if provided
        if (dto.scheduleId) {
            const schedule = await this.prisma.schedule.findFirst({
                where: { id: dto.scheduleId, schoolId }
            });
            if (!schedule) {
                throw new BadRequestException('Selected schedule does not belong to your school.');
            }
        }

        try {
            return await this.prisma.$transaction(async (tx) => {
                // Create the class
                const newClass = await tx.class.create({
                    data: {
                        name: dto.name,
                        stage: dto.stage || 'PRIMARY',
                        capacity: dto.capacity,
                        description: dto.description,
                        order: dto.order,
                        scheduleId: dto.scheduleId,
                        schoolId,
                    },
                });

                // Create sections
                if (dto.sections.length > 0) {
                    this.logger.debug(`Creating ${dto.sections.length} sections for class ${newClass.id}`);
                    const sectionData = dto.sections.map((s, index) => ({
                        name: s.name.trim(),
                        capacity: s.capacity,
                        description: s.description,
                        classId: newClass.id,
                        schoolId,
                        order: index + 1
                    }));
                    this.logger.debug(`Section data: ${JSON.stringify(sectionData)}`);
                    const result = await tx.section.createMany({
                        data: sectionData
                    });
                    this.logger.log(`Created ${result.count} sections for class ${newClass.id}`);
                }

                return newClass;
            });
        } catch (error) {
            this.logger.error('Failed to create class with sections', error.stack);
            if (error.code === 'P2002') {
                throw new BadRequestException(`Class with name '${dto.name}' already exists or a section name is duplicate.`);
            }
            throw new InternalServerErrorException('Failed to create class with sections. Transaction rolled back.');
        }
    }

    async update(schoolId: number, id: number, dto: any) {
        this.logger.log(`Updating class ${id} in school ${schoolId}`);
        // Fetch class with sections to validate capacity
        const cls = await this.prisma.class.findFirst({
            where: { id, schoolId },
            include: { sections: true },
        });

        if (!cls) {
            throw new NotFoundException(`Class with ID ${id} not found`);
        }

        // Prevent changing schedule if already assigned
        if (dto.scheduleId !== undefined && cls.scheduleId !== null && cls.scheduleId !== dto.scheduleId) {
            throw new BadRequestException(
                `Cannot change schedule. This class is already assigned to schedule ID ${cls.scheduleId}. ` +
                `Please remove the current schedule assignment first before assigning to a new schedule.`
            );
        }

        // Capacity Validation: Prevent reducing class capacity below current section usage
        if (dto.capacity !== undefined && dto.capacity !== null) {
            const currentSectionTotal = cls.sections.reduce((sum, s) => sum + (s.capacity || 0), 0);
            if (dto.capacity < currentSectionTotal) {
                throw new BadRequestException(
                    `Cannot reduce class capacity to ${dto.capacity}. Current total section capacity is ${currentSectionTotal}. Please reduce section capacities first.`
                );
            }
        }

        try {
            const updated = await this.prisma.class.update({
                where: { id },
                data: dto,
            });
            this.logger.log(`Class updated: ${updated.id}`);
            return updated;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Class with this name already exists');
            }
            this.logger.error(`Error updating class ${id}`, error.stack);
            throw error;
        }
    }

    async remove(schoolId: number, id: number) {
        this.logger.log(`Deleting class ${id} in school ${schoolId}`);
        const cls = await this.prisma.class.findFirst({
            where: { id, schoolId },
            include: {
                sections: true,
                _count: {
                    select: {
                        sections: true,
                        StudentProfile: true, // Check for students assigned to the class directly
                    }
                }
            }
        });

        if (!cls) {
            throw new NotFoundException(`Class with ID ${id} not found`);
        }

        // Safe Delete Checks
        if (cls.sections.length > 0) {
            this.logger.warn(`Deletion blocked: Class ${id} has sections`);
            throw new BadRequestException(`Cannot delete class. It has ${cls.sections.length} active sections.`);
        }

        // Note: Students are typically assigned to a section AND a class, or just a class if sections aren't used.
        // Checking StudentProfile count directly linked to class.
        if (cls._count.StudentProfile > 0) {
            this.logger.warn(`Deletion blocked: Class ${id} has assigned students`);
            throw new BadRequestException(`Cannot delete class. It has ${cls._count.StudentProfile} students assigned.`);
        }

        try {
            await this.prisma.class.delete({
                where: { id },
            });
            this.logger.log(`Class deleted: ${id}`);
            return { message: 'Class deleted successfully' };
        } catch (error) {
            this.logger.error('Error deleting class', error.stack);
            throw new InternalServerErrorException('Failed to delete class');
        }
    }

    async assignClassTeacher(schoolId: number, dto: AssignClassTeacherDto) {
        this.logger.log(`Assigning teacher ${dto.teacherId} to section ${dto.sectionId}`);
        // 1. Fetch Section and Class to validate school type
        const section = await this.prisma.section.findUnique({
            where: { id: dto.sectionId },
            include: {
                class: {
                    include: { school: true }
                }
            }
        });

        if (!section || !section.class) throw new NotFoundException('Section not found');
        const school = section.class.school;

        if (school.type === 'COACHING') {
            throw new BadRequestException('Class teacher assignment is not supported for COACHING institutes. Please assign Subject Teachers to Batches instead.');
        }

        if (section.schoolId !== schoolId) {
            throw new BadRequestException('Section does not belong to this school');
        }

        // Fetch Active Academic Year
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE }
        });
        if (!activeYear) throw new BadRequestException('No active academic year found for assignment');


        // 2. Validate Teacher exists and belongs to school
        // IMPORTANT: dto.teacherId must be TeacherProfile.id, NOT User.id
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { id: dto.teacherId }
        });

        if (!teacher) {
            throw new NotFoundException(
                `Teacher with ID ${dto.teacherId} not found. ` +
                `Note: teacherId must be the TeacherProfile ID, not the User ID.`
            );
        }

        if (teacher.schoolId !== schoolId) {
            throw new BadRequestException('Teacher does not belong to this school');
        }

        // 3. Upsert SectionTeacher (Legacy)
        const legacy = await this.prisma.sectionTeacher.upsert({
            where: {
                sectionId: dto.sectionId,
            },
            create: {
                schoolId,
                academicYearId: activeYear.id,
                sectionId: dto.sectionId,
                teacherId: teacher.id,
            },
            update: {
                teacherId: teacher.id,
                academicYearId: activeYear.id,
                assignedAt: new Date(),
            },
        });

        // 4. Upsert AcademicAssignment (New)
        await this.prisma.academicAssignment.upsert({
            where: {
                // We need a unique constraint or logical check. 
                // For Section Teacher, usually 1 per section per year in School mode.
                id: (await this.prisma.academicAssignment.findFirst({
                    where: { sectionId: dto.sectionId, role: 'CLASS_TEACHER', academicYearId: activeYear.id }
                }))?.id || -1
            },
            create: {
                schoolId,
                academicYearId: activeYear.id,
                sectionId: dto.sectionId,
                classId: section.classId,
                teacherId: teacher.id,
                role: 'CLASS_TEACHER',
                userId: teacher.userId
            },
            update: {
                teacherId: teacher.id,
                userId: teacher.userId,
                updatedAt: new Date()
            }
        });

        return legacy;
    }

    async assignHeadTeacher(schoolId: number, classId: number, dto: AssignHeadTeacherDto) {
        this.logger.log(`Assigning head teacher ${dto.teacherId} to class ${classId}`);
        // 1. Validate Class exists and belongs to school
        const cls = await this.prisma.class.findUnique({
            where: { id: classId },
            include: { school: true }
        });

        if (!cls) {
            throw new NotFoundException('Class not found');
        }

        if (cls.schoolId !== schoolId) {
            throw new BadRequestException('Class does not belong to this school');
        }

        if (cls.school.type === 'COACHING') {
            throw new BadRequestException('Head teacher assignment is not supported for COACHING institutes.');
        }

        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE }
        });
        if (!activeYear) throw new BadRequestException('No active academic year found for assignment');


        // 2. Validate Teacher exists and belongs to school
        // IMPORTANT: dto.teacherId must be TeacherProfile.id, NOT User.id
        const teacher = await this.prisma.teacherProfile.findUnique({
            where: { id: dto.teacherId }
        });

        if (!teacher) {
            throw new NotFoundException('Teacher not found');
        }

        if (teacher.schoolId !== schoolId) {
            throw new BadRequestException('Teacher does not belong to this school');
        }

        // 3. Upsert ClassHeadTeacher (Legacy)
        const legacy = await this.prisma.classHeadTeacher.upsert({
            where: {
                classId: classId,
            },
            create: {
                schoolId,
                academicYearId: activeYear.id,
                classId: classId,
                teacherId: teacher.id,
            },
            update: {
                teacherId: teacher.id,
                academicYearId: activeYear.id,
                assignedAt: new Date(),
            },
        });

        // 4. Upsert AcademicAssignment (New)
        await this.prisma.academicAssignment.upsert({
            where: {
                id: (await this.prisma.academicAssignment.findFirst({
                    where: { classId: classId, sectionId: null, role: 'HEAD_TEACHER', academicYearId: activeYear.id }
                }))?.id || -1
            },
            create: {
                schoolId,
                academicYearId: activeYear.id,
                classId: classId,
                teacherId: teacher.id,
                role: 'HEAD_TEACHER',
                userId: teacher.userId
            },
            update: {
                teacherId: teacher.id,
                userId: teacher.userId,
                updatedAt: new Date()
            }
        });

        return legacy;
    }

    async removeHeadTeacher(schoolId: number, classId: number) {
        const cls = await this.prisma.class.findUnique({
            where: { id: classId },
            include: { school: true },
        });

        if (!cls || cls.schoolId !== schoolId) {
            throw new NotFoundException('Class not found or does not belong to school');
        }

        if (cls.school.type === 'COACHING') {
            throw new BadRequestException('Head teacher assignment is not supported for COACHING institutes.');
        }

        try {
            await this.prisma.$transaction([
                this.prisma.classHeadTeacher.delete({
                    where: { classId }
                }),
                this.prisma.academicAssignment.deleteMany({
                    where: { classId, sectionId: null, role: 'HEAD_TEACHER' }
                })
            ]);
            return { message: 'Head teacher removed successfully' };
        } catch (error) {
            if (error.code === 'P2025') {
                return { message: 'No head teacher to remove' };
            }
            throw error;
        }
    }

    async removeSectionTeacher(schoolId: number, sectionId: number) {
        const section = await this.prisma.section.findUnique({
            where: { id: sectionId },
            include: { class: { include: { school: true } } },
        });

        if (!section || section.schoolId !== schoolId) {
            throw new NotFoundException('Section not found or does not belong to school');
        }

        if (section.class?.school?.type === 'COACHING') {
            throw new BadRequestException('Class teacher assignment is not supported for COACHING institutes. Please assign Subject Teachers to Batches instead.');
        }

        try {
            await this.prisma.$transaction([
                this.prisma.sectionTeacher.delete({
                    where: { sectionId }
                }),
                this.prisma.academicAssignment.deleteMany({
                    where: { sectionId, role: 'CLASS_TEACHER' }
                })
            ]);
            return { message: 'Section teacher removed successfully' };
        } catch (error) {
            if (error.code === 'P2025') {
                return { message: 'No section teacher to remove' };
            }
            throw error;
        }
    }

    async createBulk(schoolId: number, dto: BulkCreateClassDto) {
        this.logger.log(`Bulk creating ${dto.classes.length} classes`);
        // No need for Academic Year check for Class Creation anymore

        try {
            await this.prisma.$transaction(async (tx) => {
                for (const clsDto of dto.classes) {
                    await tx.class.create({
                        data: {
                            name: clsDto.name,
                            stage: clsDto.stage,
                            capacity: clsDto.capacity,
                            order: clsDto.order,
                            description: clsDto.description,
                            schoolId,
                            // academicYearId removed
                        },
                    });
                }
            });
            return { message: `Successfully created ${dto.classes.length} classes` };
        } catch (error) {
            this.logger.error('Bulk create class error', error.stack);
            if (error.code === 'P2002') {
                throw new BadRequestException('One or more classes already exist (duplicate name)');
            }
            throw new InternalServerErrorException('Failed to process bulk creation');
        }
    }

    getTemplate() {
        return [
            {
                name: "Class 1",
                capacity: 30,
                order: 1,
                description: "Standard primary class"
            },
            {
                name: "Class 2",
                capacity: 35,
                order: 2,
                description: "Standard primary class"
            }
        ];
    }
}
