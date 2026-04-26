import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto, UpdateClassSubjectDto, GetSubjectsQueryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/subject.dto';
import { AcademicYearStatus, AssessmentType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogEvent } from '../../common/audit/audit.event';

@Injectable()
export class SubjectService {
    private readonly logger = new Logger(SubjectService.name);

    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }

    private async getActiveAcademicYear(schoolId: number) {
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE }
        });
        if (!academicYear) {
            this.logger.error(`[School ${schoolId}] No active academic year found`);
            throw new BadRequestException('No active academic year found');
        }
        return academicYear;
    }

    private async validateSubjectEntities(schoolId: number, departmentId?: number, teacherId?: number) {
        if (departmentId) {
            const dept = await this.prisma.department.findFirst({
                where: { id: departmentId, schoolId }
            });
            if (!dept) throw new NotFoundException('Specified Department not found in this school');
        }
        if (teacherId) {
            const teacher = await this.prisma.teacherProfile.findFirst({
                where: { id: teacherId, schoolId }
            });
            if (!teacher) throw new NotFoundException('Specified Teacher not found in this school');
        }
    }

    // ==================================================================
    // 1. GLOBAL SUBJECT CATALOG (Scoped by School & Year)
    // ==================================================================

    async create(schoolId: number, dto: CreateSubjectDto, userId: number) {
        this.logger.log(`Creating subject for school ${schoolId}: ${dto.code} - ${dto.name}`);

        await this.validateSubjectEntities(schoolId, dto.departmentId);

        const existing = await this.prisma.subject.findUnique({
            where: {
                schoolId_code: {
                    schoolId,
                    code: dto.code
                }
            },
        });

        if (existing) {
            this.logger.warn(`Subject conflict: ${dto.code} already exists in school ${schoolId}`);
            throw new ConflictException(`Subject code ${dto.code} already exists for this school`);
        }

        try {
            const subject = await this.prisma.subject.create({
                data: {
                    ...dto,
                    schoolId,
                },
            });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId,
                userId,
                'SUBJECT',
                'CREATE',
                subject.id,
                dto
            ));

            this.logger.log(`Subject created successfully: ${subject.id}`);
            return subject;
        } catch (error) {
            this.logger.error(`Failed to create subject for school ${schoolId}`, error.stack);
            throw error;
        }
    }

    async findAll(schoolId: number, query: GetSubjectsQueryDto) {
        this.logger.log(`[School ${schoolId}] Fetching subjects: ${JSON.stringify(query)}`);
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 10;
        const skip = (page - 1) * limit;

        const where: any = { schoolId };

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { code: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.subject.findMany({
                where,
                include: { department: true },
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.subject.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                pages: total > 0 ? Math.ceil(total / limit) : 0,
            }
        };
    }

    async findOne(schoolId: number, id: number) {
        const subject = await this.prisma.subject.findFirst({
            where: { id, schoolId }
        });
        if (!subject) {
            this.logger.warn(`Subject not found: ${id} in school ${schoolId}`);
            throw new NotFoundException('Subject not found');
        }
        return subject;
    }

    async update(schoolId: number, id: number, dto: UpdateSubjectDto, userId: number) {
        this.logger.log(`Updating subject ${id} in school ${schoolId}`);
        const current = await this.findOne(schoolId, id);

        if (dto.departmentId) {
            await this.validateSubjectEntities(schoolId, dto.departmentId);
        }

        try {
            const updated = await this.prisma.subject.update({
                where: { id },
                data: dto,
            });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId, userId, 'SUBJECT', 'UPDATE', id, { before: current, after: updated }
            ));

            this.logger.log(`Subject updated: ${id}`);
            return updated;
        } catch (error) {
            this.logger.error(`Failed to update subject ${id}`, error.stack);
            throw error;
        }
    }

    async remove(schoolId: number, id: number, userId: number) {
        this.logger.log(`[School ${schoolId}] Attempting to remove subject ${id}`);
        const subject = await this.findOne(schoolId, id);

        const inUseCount = await this.prisma.classSubject.count({
            where: { subjectId: id, schoolId }
        });

        if (inUseCount > 0) {
            throw new ConflictException('Cannot delete subject: It is already assigned to classes/sections. Unassign it from all classes first.');
        }

        const scheduledInExams = await this.prisma.examSchedule.count({
            where: { subjectId: id, schoolId }
        });
        if (scheduledInExams > 0) {
            throw new ConflictException('Cannot delete subject: It is scheduled in active datesheets/exams.');
        }

        try {
            const deleted = await this.prisma.subject.delete({ where: { id } });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId,
                userId,
                'SUBJECT',
                'DELETE',
                id
            ));

            this.logger.log(`[School ${schoolId}] Subject deleted: ${id}`);
            return deleted;
        } catch (e) {
            this.logger.error(`[School ${schoolId}] Failed to delete subject ${id}`, e.stack);
            throw new BadRequestException('Failed to delete subject');
        }
    }

    // ==================================================================
    // 2. CLASS SPECIFIC CONFIGURATION (ClassSubject)
    // ==================================================================

    async assignToClass(schoolId: number, dto: CreateClassSubjectDto, userId: number) {
        this.logger.log(`[School ${schoolId}] Assigning subject ${dto.subjectId} to class ${dto.classId}`);
        const academicYear = await this.getActiveAcademicYear(schoolId);

        await this.validateSubjectEntities(schoolId, undefined, dto.teacherId);

        const subject = await this.prisma.subject.findFirst({
            where: { id: dto.subjectId, schoolId }
        });
        if (!subject) throw new NotFoundException('Subject not found');

        let sectionsToAssign: any[] = [];

        if (dto.sectionId) {
            const section = await this.prisma.section.findFirst({
                where: { id: dto.sectionId, schoolId }
            });
            if (!section) throw new NotFoundException('Section not found');
            sectionsToAssign.push(section);
        } else {
            sectionsToAssign = await this.prisma.section.findMany({
                where: { classId: dto.classId, schoolId }
            });
            if (sectionsToAssign.length === 0) throw new BadRequestException('No sections found for this class. Please create sections for this class first.');
        }

        // 🛡️ Enterprise Validation
        if (dto.credits !== undefined && dto.credits < 0) throw new BadRequestException('Credits cannot be negative');
        if (dto.maxMarks !== undefined && dto.passMarks !== undefined) {
            if (dto.passMarks > dto.maxMarks) throw new BadRequestException('Passing marks cannot be greater than maximum marks');
        }

        // 1. Atomic Transaction for dual occupancy sync
        try {
            await this.prisma.$transaction(async (tx) => {
                // A. Create/Update ClassSubject records (the configuration)
                // We use individual upserts instead of createMany to ensure existing configurations are updated
                // with new values (like credits/marks) if the user re-assigns them.
                for (const section of sectionsToAssign) {
                    await tx.classSubject.upsert({
                        where: {
                            schoolId_academicYearId_sectionId_subjectId: {
                                schoolId,
                                academicYearId: academicYear.id,
                                sectionId: section.id,
                                subjectId: dto.subjectId
                            }
                        },
                        update: {
                            classId: dto.classId,
                            teacherProfileId: dto.teacherId,
                            type: dto.type,
                            credits: dto.credits,
                            weeklyClasses: dto.weeklyClasses,
                            maxMarks: dto.maxMarks,
                            passMarks: dto.passMarks,
                            isOptional: dto.isOptional,
                            hasLab: dto.hasLab,
                            excludeFromGPA: dto.excludeFromGPA,
                            isGraded: dto.isGraded ?? true,
                            assessmentType: (dto.assessmentType ?? AssessmentType.MARKS) as AssessmentType
                        },
                        create: {
                            schoolId,
                            academicYearId: academicYear.id,
                            classId: dto.classId,
                            sectionId: section.id,
                            subjectId: dto.subjectId,
                            teacherProfileId: dto.teacherId, // SYNC: Store in config
                            classSubjectCode: dto.classSubjectCode || `${subject.code}-${section.id}`,
                            type: dto.type,
                            credits: dto.credits,
                            weeklyClasses: dto.weeklyClasses,
                            maxMarks: dto.maxMarks,
                            passMarks: dto.passMarks,
                            isOptional: dto.isOptional,
                            hasLab: dto.hasLab,
                            excludeFromGPA: dto.excludeFromGPA,
                            isGraded: dto.isGraded ?? true,
                            assessmentType: (dto.assessmentType ?? AssessmentType.MARKS) as AssessmentType
                        }
                    });
                }

                // B. Synchronize SubjectAssignment (the teacher allocation used by Timetable)
                if (dto.teacherId) {
                    for (const section of sectionsToAssign) {
                        await this.syncTeacherAllocation(tx, {
                            schoolId,
                            academicYearId: academicYear.id,
                            classId: dto.classId,
                            sectionId: section.id,
                            subjectId: dto.subjectId,
                            teacherId: dto.teacherId,
                            periodsPerWeek: dto.weeklyClasses
                        });
                    }
                }
            });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId,
                userId,
                'CLASS_SUBJECT',
                'ASSIGN',
                dto.subjectId,
                { dto, sectionsAssigned: sectionsToAssign.length }
            ));

            this.logger.log(`[School ${schoolId}] Assignment complete. Sections assigned: ${sectionsToAssign.length}`);
            return { message: `Assigned to ${sectionsToAssign.length} sections.` };
        } catch (error) {
            if (error?.code === 'P2002') {
                throw new ConflictException('One or more subjects are already assigned to the specified section(s).');
            }
            if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`[School ${schoolId}] Bulk assignment failed`, error.stack);
            throw new BadRequestException('Failed to assign subjects to sections');
        }
    }

    async getClassAssignmentById(schoolId: number, id: number) {
        const cs = await this.prisma.classSubject.findFirst({
            where: { id, schoolId },
            include: {
                subject: true,
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } }
            }
        });

        if (!cs) throw new NotFoundException('Assignment not found');

        // Fetch current teacher allocation
        const assignment = await this.prisma.subjectAssignment.findFirst({
            where: {
                schoolId,
                academicYearId: cs.academicYearId,
                classId: cs.classId,
                sectionId: cs.sectionId,
                subjectId: cs.subjectId,
                isActive: true
            },
            include: {
                teacher: { include: { user: { select: { name: true, photo: true } } } }
            }
        });

        return {
            ...cs,
            assignedTeacher: assignment?.teacher,
            // currentTeacherId: the ID to pre-populate in the edit form
            currentTeacherId: assignment?.teacherId ?? cs.teacherProfileId ?? null,
            periodsPerWeek: assignment?.periodsPerWeek ?? cs.weeklyClasses ?? 0
        };
    }

    /**
     * CENTRALIZED SYNC HELPER:
     * Synchronizes Phase 1 (ClassSubject configuration) with Phase 2 (SubjectAssignment allocation).
     * This ensures that Timetable and Principal views show the same reality.
     */
    private async syncTeacherAllocation(tx: any, data: {
        schoolId: number,
        academicYearId: number,
        classId: number,
        sectionId: number,
        subjectId: number,
        teacherId: number | null,
        periodsPerWeek?: number | null
    }) {
        this.logger.debug(`[Sync] Syncing Teacher Allocation for Subject:${data.subjectId} in Section:${data.sectionId}`);

        if (data.teacherId) {
            // Activate/Update assignment
            await tx.subjectAssignment.upsert({
                where: {
                    schoolId_academicYearId_classId_sectionId_subjectId: {
                        schoolId: data.schoolId,
                        academicYearId: data.academicYearId,
                        classId: data.classId,
                        sectionId: data.sectionId,
                        subjectId: data.subjectId
                    }
                },
                update: {
                    teacherId: data.teacherId,
                    periodsPerWeek: data.periodsPerWeek,
                    isActive: true
                },
                create: {
                    schoolId: data.schoolId,
                    academicYearId: data.academicYearId,
                    classId: data.classId,
                    sectionId: data.sectionId,
                    subjectId: data.subjectId,
                    teacherId: data.teacherId,
                    periodsPerWeek: data.periodsPerWeek,
                    isActive: true
                }
            });
        } else {
            // Deactivate assignment if teacherId specifically set to null
            // This allows the configuration to remain but removes the teacher from the timetable loop
            await tx.subjectAssignment.updateMany({
                where: {
                    schoolId: data.schoolId,
                    academicYearId: data.academicYearId,
                    classId: data.classId,
                    sectionId: data.sectionId,
                    subjectId: data.subjectId,
                    isActive: true
                },
                data: { isActive: false }
            });
        }
    }

    async getClassSubjects(schoolId: number, classId?: number, sectionId?: number) {
        const academicYear = await this.getActiveAcademicYear(schoolId);

        const where: any = {
            schoolId,
            academicYearId: academicYear.id
        };
        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;

        const results = await this.prisma.classSubject.findMany({
            where,
            include: {
                subject: true,
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true, classId: true } },
                category: { select: { id: true, name: true } },
                teacherProfile: { include: { user: { select: { id: true, name: true, photo: true } } } }
            }
        });

        // 🛡️ STRICT INTEGRITY FILTER: Ensure the section actually belongs to the class
        // AND DEDUPLICATE: Prevent same section appearing multiple times for same subject
        const seen = new Set<string>();
        const filteredResults: typeof results = [];
        
        for (const cs of results) {
            if (cs.section && cs.section.classId !== cs.classId) {
                continue; // Wrong class linkage
            }
            
            const key = `${cs.classId}-${cs.sectionId}-${cs.subjectId}`;
            if (seen.has(key)) {
                continue; // Duplicate record
            }
            
            seen.add(key);
            filteredResults.push(cs);
        }

        this.logger.log(`[School ${schoolId}] getClassSubjects: Fetched ${results.length}, Filtered to ${filteredResults.length} unique/valid configs.`);

        // Fetch corresponding teacher assignments
        const assignments = await this.prisma.subjectAssignment.findMany({
            where: {
                schoolId,
                academicYearId: academicYear.id,
                classId: classId ? classId : undefined,
                sectionId: sectionId ? sectionId : undefined,
                isActive: true
            },
            include: {
                teacher: {
                    include: {
                        user: { select: { name: true, photo: true } }
                    }
                }
            }
        });

        // Map SubjectAssignment teacher data onto each ClassSubject record
        return filteredResults.map(cs => {
            const assignment = assignments.find(a =>
                a.classId === cs.classId &&
                a.sectionId === cs.sectionId &&
                a.subjectId === cs.subjectId
            );

            if (assignment) {
                this.logger.debug(`[getClassSubjects] Found assignment for Class:${cs.classId}, Section:${cs.sectionId}, Subject:${cs.subjectId} -> Teacher:${assignment.teacherId}`);
            } else {
                this.logger.debug(`[getClassSubjects] NO assignment found for Class:${cs.classId}, Section:${cs.sectionId}, Subject:${cs.subjectId}. Results total: ${assignments.length}`);
            }

            // Phase 2 (SubjectAssignment) takes precedence for display;
            // Phase 1 (ClassSubject.teacherProfile) is the fallback.
            const assignedTeacher = assignment?.teacher
                ? { id: assignment.teacher.id, user: assignment.teacher.user }
                : null;

            return {
                ...cs,
                assignedTeacher,          // ← Phase 2: used in list display & edit
                periodsPerWeek: assignment?.periodsPerWeek ?? cs.weeklyClasses ?? 0,
                // currentTeacherId: the ID to pre-populate in the edit form
                currentTeacherId: assignment?.teacherId ?? cs.teacherProfileId ?? null,
            };
        });
    }

    async getMatrix(schoolId: number, classId: number) {
        const academicYear = await this.getActiveAcademicYear(schoolId);

        const subjects = await this.prisma.classSubject.findMany({
            where: { schoolId, academicYearId: academicYear.id, classId },
            include: {
                subject: { select: { id: true, name: true, code: true } },
                section: { select: { id: true, name: true } }
            }
        });

        const assignments = await this.prisma.subjectAssignment.findMany({
            where: { schoolId, academicYearId: academicYear.id, classId, isActive: true },
            include: {
                teacher: { include: { user: { select: { name: true } } } }
            }
        });

        // Group by subject
        const matrix: Record<number, any> = {};
        subjects.forEach(cs => {
            if (!matrix[cs.subjectId]) {
                matrix[cs.subjectId] = {
                    subject: cs.subject,
                    sections: {}
                };
            }

            const assignment = assignments.find(a =>
                a.sectionId === cs.sectionId && a.subjectId === cs.subjectId
            );

            matrix[cs.subjectId].sections[cs.sectionId] = {
                configured: true,
                teacher: assignment?.teacher?.user?.name || 'Unassigned',
                periods: assignment?.periodsPerWeek || 0
            };
        });

        return Object.values(matrix);
    }

    async bulkCopy(schoolId: number, dto: { fromClassId: number, toClassId: number, copyTeachers: boolean }, userId: number) {
        const academicYear = await this.getActiveAcademicYear(schoolId);

        const [fromClass, toClass] = await Promise.all([
            this.prisma.class.findFirst({ where: { id: dto.fromClassId, schoolId } }),
            this.prisma.class.findFirst({ where: { id: dto.toClassId, schoolId } }),
        ]);
        if (!fromClass) throw new NotFoundException('Source class not found');
        if (!toClass) throw new NotFoundException('Target class not found');

        const source = await this.prisma.classSubject.findMany({
            where: { schoolId, academicYearId: academicYear.id, classId: dto.fromClassId },
            include: { subject: true }
        });

        if (source.length === 0) throw new BadRequestException('Source class has no subject configuration.');

        const targetSections = await this.prisma.section.findMany({
            where: { schoolId, classId: dto.toClassId }
        });

        if (targetSections.length === 0) throw new BadRequestException('Target class has no sections. Please create sections first.');

        return this.prisma.$transaction(async (tx) => {
            let copiedCount = 0;
            for (const item of source) {
                for (const section of targetSections) {
                    // Create config
                    await tx.classSubject.upsert({
                        where: {
                            schoolId_academicYearId_sectionId_subjectId: {
                                schoolId, academicYearId: academicYear.id,
                                sectionId: section.id, subjectId: item.subjectId
                            }
                        },
                        update: {
                            type: item.type,
                            credits: item.credits,
                            weeklyClasses: item.weeklyClasses,
                            categoryId: item.categoryId,
                            teacherProfileId: dto.copyTeachers ? item.teacherProfileId : undefined
                        },
                        create: {
                            schoolId, academicYearId: academicYear.id,
                            classId: dto.toClassId, sectionId: section.id, subjectId: item.subjectId,
                            type: item.type, credits: item.credits, weeklyClasses: item.weeklyClasses,
                            categoryId: item.categoryId, 
                            classSubjectCode: item.classSubjectCode || `${item.subjectId}-${section.id}`,
                            teacherProfileId: dto.copyTeachers ? item.teacherProfileId : null
                        }
                    });

                    // Optional: Copy teachers (Phase 2 Allocation)
                    if (dto.copyTeachers) {
                        const originalAssignment = await tx.subjectAssignment.findFirst({
                            where: {
                                schoolId, academicYearId: academicYear.id,
                                classId: dto.fromClassId, 
                                sectionId: item.sectionId, // Match the section if possible or use class-level logic
                                subjectId: item.subjectId,
                                isActive: true
                            }
                        });

                        if (originalAssignment) {
                            await this.syncTeacherAllocation(tx, {
                                schoolId,
                                academicYearId: academicYear.id,
                                classId: dto.toClassId,
                                sectionId: section.id,
                                subjectId: item.subjectId,
                                teacherId: originalAssignment.teacherId,
                                periodsPerWeek: originalAssignment.periodsPerWeek
                            });
                        }
                    }
                    copiedCount++;
                }
            }
            return { message: `Successfully copied configuration to ${targetSections.length} sections.` };
        });
    }

    async updateClassSubject(schoolId: number, id: number, dto: UpdateClassSubjectDto, userId: number) {
        this.logger.log(`Updating class subject ${id}`);
        const existing = await this.prisma.classSubject.findFirst({
            where: { id, schoolId },
            include: { subject: true }
        });
        if (!existing) throw new NotFoundException('Class Subject configuration not found');

        await this.validateSubjectEntities(schoolId, undefined, dto.teacherId);

        // 🛡️ Enterprise Validation
        if (dto.credits !== undefined && dto.credits < 0) throw new BadRequestException('Credits cannot be negative');
        if (dto.maxMarks !== undefined && dto.passMarks !== undefined) {
            if (dto.passMarks > dto.maxMarks) throw new BadRequestException('Passing marks cannot be greater than maximum marks');
        } else if (dto.passMarks !== undefined && existing.maxMarks && dto.passMarks > existing.maxMarks) {
            throw new BadRequestException('Passing marks cannot be greater than maximum marks');
        }

        const { teacherId, ...rest } = dto;

        const updated = await this.prisma.$transaction(async (tx) => {
            // 1. Update configuration
            const cs = await tx.classSubject.update({
                where: { id },
                data: {
                    ...rest,
                    teacherProfileId: teacherId, // SYNC: Store in config
                    assessmentType: dto.assessmentType as AssessmentType
                }
            });

            // 2. Synchronize teacher allocation — only when teacherId is explicitly provided
            // Omitting teacherId in the update payload must NOT deactivate the existing teacher
            if (teacherId !== undefined) {
                await this.syncTeacherAllocation(tx, {
                    schoolId,
                    academicYearId: cs.academicYearId,
                    classId: cs.classId,
                    sectionId: cs.sectionId,
                    subjectId: cs.subjectId,
                    teacherId: teacherId,
                    periodsPerWeek: dto.weeklyClasses ?? cs.weeklyClasses
                });
            }

            return cs;
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId, userId, 'CLASS_SUBJECT', 'UPDATE', id, { before: existing, after: updated }
        ));

        return updated;
    }

    async removeClassSubject(schoolId: number, id: number, userId: number) {
        this.logger.log(`Removing class subject ${id}`);
        const existing = await this.prisma.classSubject.findFirst({
            where: { id, schoolId },
            include: { subject: true, class: { select: { name: true } }, section: { select: { name: true } } }
        });
        if (!existing) throw new NotFoundException('Class Subject configuration not found');

        // 1. Identify scope for cleanup
        const { academicYearId, classId, sectionId, subjectId } = existing;

        // ENTERPRISE GUARD: Check for Marks/Results before removing config
        const hasMarks = await this.prisma.examResult.findFirst({
            where: { 
                schoolId,
                academicYearId,
                student: { classId, sectionId },
                schedule: { subjectId }
            }
        });

        if (hasMarks) {
            throw new ConflictException('Cannot remove subject assignment: Exam marks have already been recorded for this subject in this class.');
        }

        const deleted = await this.prisma.$transaction(async (tx) => {
            // 2. Delete Timetable Entries
            // Find groups associated with this class/section to clean up their timetable
            const groups = await tx.academicGroup.findMany({
                where: { schoolId, classId, sectionId },
                select: { id: true }
            });
            const groupIds = groups.map(g => g.id);

            if (groupIds.length > 0) {
                await tx.timetableEntry.deleteMany({
                    where: {
                        schoolId,
                        academicYearId,
                        subjectId,
                        groupId: { in: groupIds }
                    }
                });
            }

            // 3. Delete Subject Assignments (Teacher allocations)
            await tx.subjectAssignment.deleteMany({
                where: {
                    schoolId,
                    academicYearId,
                    classId,
                    sectionId,
                    subjectId
                }
            });

            // 4. Delete the configuration itself
            return tx.classSubject.delete({ where: { id } });
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId,
            userId,
            'CLASS_SUBJECT',
            'DELETE',
            id
        ));

        return deleted;
    }

    // ==================================================================
    // 3. STATS & SYLLABUS
    // ==================================================================

    async getStats(schoolId: number) {
        const academicYear = await this.getActiveAcademicYear(schoolId);

        const [totalSubjects, assignedSubjects, categoryCounts] = await Promise.all([
            this.prisma.subject.count({ where: { schoolId } }),
            this.prisma.classSubject.count({ where: { schoolId, academicYearId: academicYear.id } }),
            this.prisma.classSubject.groupBy({
                by: ['categoryId'],
                where: { schoolId, academicYearId: academicYear.id },
                _count: true
            })
        ]);

        return {
            totalSubjects,
            assignedSubjects,
            categoryStats: categoryCounts
        };
    }

    async getAllSyllabus(schoolId: number) {
        this.logger.log(`[School ${schoolId}] Fetching full syllabus tree`);
        const academicYear = await this.getActiveAcademicYear(schoolId);

        // 1. Check if school uses HOMEWORK module
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            include: { schoolModules: { include: { module: true } } }
        });

        const usesHomeworkModule = school?.schoolModules.some(
            sm => sm.enabled && sm.module.key === 'HOMEWORK'
        ) || false;

        // 2. Find all classes and their active subjects/assignments
        const classes: any[] = await this.prisma.class.findMany({
            where: { schoolId },
            include: {
                sections: {
                    include: {
                        SubjectAssignment: {
                            where: { academicYearId: academicYear.id },
                            include: {
                                subject: {
                                    include: {
                                        syllabi: {
                                            where: {
                                                academicYearId: academicYear.id,
                                                parentId: null // top level units
                                            },
                                            orderBy: { orderIndex: 'asc' },
                                            include: {
                                                children: {
                                                    orderBy: { orderIndex: 'asc' },
                                                    include: {
                                                        children: { orderBy: { orderIndex: 'asc' } }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                teacher: {
                                    include: { user: true }
                                },
                                // For HOMEWORK schools
                                syllabusFiles: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        // 3. Format the response data for the frontend
        const formattedClasses = classes.map(cls => ({
            id: cls.id,
            name: cls.name,
            sections: cls.sections.map(sec => ({
                id: sec.id,
                name: sec.name,
                subjects: sec.SubjectAssignment.map(assignment => ({
                    id: assignment.subject.id,
                    name: assignment.subject.name,
                    teacherName: assignment.teacher?.user?.name || 'Unassigned',
                    syllabusText: assignment.subject.syllabi.filter(u => (!u.classId || u.classId === cls.id)).map(unit => ({
                        id: unit.id,
                        title: unit.title,
                        chapters: unit.children.map(chapter => ({
                            id: chapter.id,
                            title: chapter.title,
                            topics: chapter.children.map(topic => ({
                                id: topic.id,
                                title: topic.title,
                                isCompleted: topic.isCompleted
                            }))
                        }))
                    })),
                    syllabusFiles: assignment.syllabusFiles.map(file => ({
                        id: file.id,
                        fileName: file.fileName,
                        fileUrl: file.fileUrl,
                        mimeType: file.mimeType,
                        fileSize: file.fileSize,
                        createdAt: file.createdAt
                    }))
                }))
            }))
        }));

        return {
            schoolName: school?.name || 'School',
            academicYear: academicYear.name,
            usesHomeworkModule,
            classes: formattedClasses
        };
    }

    // ==================================================================
    // 4. CATEGORIES
    // ==================================================================

    async createCategory(schoolId: number, dto: CreateCategoryDto, userId: number) {
        this.logger.log(`Creating category ${dto.name}`);
        const existing = await this.prisma.subjectCategory.findUnique({
            where: {
                schoolId_name: {
                    schoolId,
                    name: dto.name
                }
            }
        });
        if (existing) throw new ConflictException('Category already exists');

        const category = await this.prisma.subjectCategory.create({
            data: { ...dto, schoolId }
        });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId,
            userId,
            'SUBJECT_CATEGORY',
            'CREATE',
            category.id,
            dto
        ));

        return category;
    }

    async findAllCategories(schoolId: number) {
        return this.prisma.subjectCategory.findMany({
            where: { schoolId }
        });
    }

    async updateCategory(schoolId: number, id: number, dto: UpdateCategoryDto, userId: number) {
        const cat = await this.prisma.subjectCategory.findFirst({ where: { id, schoolId } });
        if (!cat) throw new NotFoundException('Category not found');

        const updated = await this.prisma.subjectCategory.update({ where: { id }, data: dto });

        this.eventEmitter.emit('audit.log', new AuditLogEvent(
            schoolId,
            userId,
            'SUBJECT_CATEGORY',
            'UPDATE',
            id,
            dto
        ));

        return updated;
    }

    async removeCategory(schoolId: number, id: number, userId: number) {
        const cat = await this.prisma.subjectCategory.findFirst({ where: { id, schoolId } });
        if (!cat) throw new NotFoundException('Category not found');

        try {
            const deleted = await this.prisma.subjectCategory.delete({ where: { id } });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId,
                userId,
                'SUBJECT_CATEGORY',
                'DELETE',
                id
            ));

            return deleted;
        } catch (e) {
            throw new BadRequestException('Cannot delete category in use');
        }
    }

    // ==================================================================
    // 6. INTELLIGENT ALLOCATION
    // ==================================================================

    async getTeacherSuggestions(schoolId: number, subjectId: number, classId: number) {
        this.logger.log(`[School ${schoolId}] Computing intelligent faculty recommendations for Subject ${subjectId}`);
        const academicYear = await this.getActiveAcademicYear(schoolId);

        this.logger.log(`[School ${schoolId}] Fetching active teacher records for recommendation context...`);
        // 1. Fetch relevant data in parallel
        const [subject, teachers, assignments] = await Promise.all([
            this.prisma.subject.findUnique({
                where: { id: subjectId, schoolId },
                include: { department: true }
            }),
            this.prisma.teacherProfile.findMany({
                where: { schoolId, isActive: true },
                include: {
                    user: { select: { name: true, photo: true } },
                    personalInfo: { select: { email: true } },
                    preferredSubjects: { where: { subjectId } },
                    qualifications: true
                }
            }),
            this.prisma.subjectAssignment.groupBy({
                by: ['teacherId'],
                where: { schoolId, academicYearId: academicYear.id, isActive: true },
                _count: true
            })
        ]);

        this.logger.log(`[School ${schoolId}] Suggestions Audit: Found ${teachers.length} Active Teachers in DB. Subject: ${subject?.name}`);

        if (!subject) throw new NotFoundException('Subject not found');

        const workloadMap = (assignments as any[]).reduce((acc, curr) => {
            if (curr.teacherId) acc[curr.teacherId] = curr._count;
            return acc;
        }, {} as Record<number, number>);

        // 2. Score and Rank Teachers
        const rankedTeachers = (teachers as any[]).map(teacher => {
            let score = 0;
            const reasons: string[] = [];

            // A. Preference Match (+50)
            if (teacher.preferredSubjects && teacher.preferredSubjects.length > 0) {
                score += 50;
                reasons.push('Primary Subject Preference');
            }

            // B. Qualification Match (+30) - Search both degree and specialization
            const subjectLower = subject.name.toLowerCase();
            const qualifications = teacher.qualifications || [];
            const matchingQual = qualifications.find((q: any) => 
                (q.specialization?.toLowerCase() || '').includes(subjectLower) ||
                subjectLower.includes(q.specialization?.toLowerCase() || '') ||
                (q.degree?.toLowerCase() || '').includes(subjectLower)
            );

            if (matchingQual) {
                score += 30;
                reasons.push(`Specialized in ${matchingQual.specialization || matchingQual.degree}`);
            }

            // C. Experience Match (+10 for every other section currently teaching this subject)
            // Note: workload penalty already exists below, so this rewards expertise.
            // (TBD: implementation needs a group-by query but skipping for now to keep it lightweight)

            // D. Workload Penalty (-5 per assignment)
            const load = workloadMap[teacher.id] || 0;
            score -= (load * 5);
            if (load < 3) reasons.push('Low current workload');

            return {
                teacherId: teacher.id,
                name: teacher.user?.name || 'Unknown',
                photo: teacher.user?.photo,
                email: teacher.personalInfo?.email || '',
                score,
                reasons,
                currentLoad: load
            };
        });

        this.logger.log(`[School ${schoolId}] Recommendations complete. Top score: ${rankedTeachers.length > 0 ? Math.max(...rankedTeachers.map(r => r.score)) : 0}`);

        return rankedTeachers
            .filter(t => t.score > -20 || t.currentLoad < 10) // Filter out clearly unsuitable/overloaded
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
    }

    // ==================================================================
    // 5. EXPORT
    // ==================================================================

    async exportSubjects(schoolId: number) {
        this.logger.log(`[School ${schoolId}] Exporting subjects catalog`);
        const subjects = await this.prisma.subject.findMany({
            where: { schoolId }
        });

        const header = "ID,Name,Code\n";
        const rows = subjects.map(s => `${s.id},${s.name},${s.code}`).join("\n");
        return {
            filename: `subjects-catalog-${new Date().toISOString().split('T')[0]}.csv`,
            content: header + rows
        };
    }

    async exportClassSubjects(schoolId: number) {
        this.logger.log(`[School ${schoolId}] Exporting class subject assignments`);
        const academicYear = await this.getActiveAcademicYear(schoolId);
        const cs = await this.prisma.classSubject.findMany({
            where: { schoolId, academicYearId: academicYear.id },
            include: { class: true, section: true, subject: true }
        });
        const header = "Class,Section,Subject,Code,Credits\n";
        const rows = cs.map(c => `"${c.class.name}","${c.section.name}","${c.subject.name}","${c.classSubjectCode}",${c.credits || 0}`).join("\n");
        return {
            filename: `class-subjects-${new Date().toISOString().split('T')[0]}.csv`,
            content: header + rows
        };
    }

    async getFacultyOverview(schoolId: number) {
        this.logger.log(`[School ${schoolId}] Fetching faculty overview (subject assignments)`);
        const academicYear = await this.getActiveAcademicYear(schoolId);

        const teachers = await this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            include: {
                user: { select: { name: true, photo: true } },
                personalInfo: { select: { email: true } },
                subjectAssignments: {
                    where: { academicYearId: academicYear.id, isActive: true },
                    include: {
                        subject: true,
                        class: { select: { name: true } },
                        section: { select: { name: true } }
                    }
                }
            },
            orderBy: { user: { name: 'asc' } }
        });

        return teachers.map(t => ({
            id: t.id,
            name: t.user.name,
            photo: t.user.photo,
            email: t.personalInfo?.email || '',
            assignmentsCount: t.subjectAssignments.length,
            subjects: t.subjectAssignments.map(a => ({
                id: a.subject.id,
                name: a.subject.name,
                code: a.subject.code,
                className: a.class?.name,
                sectionName: a.section?.name,
                periodsPerWeek: a.periodsPerWeek
            }))
        }));
    }
}
