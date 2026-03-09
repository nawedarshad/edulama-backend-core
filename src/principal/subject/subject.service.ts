import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto, UpdateClassSubjectDto, GetSubjectsQueryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/subject.dto';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class SubjectService {
    private readonly logger = new Logger(SubjectService.name);

    constructor(private prisma: PrismaService) { }

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

    // ==================================================================
    // 1. GLOBAL SUBJECT CATALOG (Scoped by School & Year)
    // ==================================================================

    async create(schoolId: number, dto: CreateSubjectDto) {
        this.logger.log(`Creating subject for school ${schoolId}: ${dto.code} - ${dto.name}`);

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
                include: { department: true }, // Subject has department, not category
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
                pages: Math.ceil(total / limit),
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

    async update(schoolId: number, id: number, dto: UpdateSubjectDto) {
        this.logger.log(`Updating subject ${id} in school ${schoolId}`);
        await this.findOne(schoolId, id);
        try {
            const updated = await this.prisma.subject.update({
                where: { id },
                data: dto,
            });
            this.logger.log(`Subject updated: ${id}`);
            return updated;
        } catch (error) {
            this.logger.error(`Failed to update subject ${id}`, error.stack);
            throw error;
        }
    }

    async remove(schoolId: number, id: number) {
        this.logger.log(`[School ${schoolId}] Attempting to remove subject ${id}`);
        await this.findOne(schoolId, id);

        const inUseCount = await this.prisma.classSubject.count({
            where: { subjectId: id, schoolId }
        });

        if (inUseCount > 0) {
            throw new BadRequestException('Cannot delete subject: It is already assigned to classes/sections');
        }

        try {
            const deleted = await this.prisma.subject.delete({ where: { id } });
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

    async assignToClass(schoolId: number, dto: CreateClassSubjectDto) {
        this.logger.log(`[School ${schoolId}] Assigning subject ${dto.subjectId} to class ${dto.classId}`);
        const academicYear = await this.getActiveAcademicYear(schoolId);

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
            if (sectionsToAssign.length === 0) throw new BadRequestException('No sections found for this class');
        }

        // Optimization: bulk create assignment records using createMany
        try {
            const count = await this.prisma.classSubject.createMany({
                data: sectionsToAssign.map(section => ({
                    schoolId,
                    academicYearId: academicYear.id,
                    classId: dto.classId,
                    sectionId: section.id,
                    subjectId: dto.subjectId,
                    classSubjectCode: dto.classSubjectCode || `${subject.code}-${section.id}`,
                    type: dto.type,
                    credits: dto.credits,
                    weeklyClasses: dto.weeklyClasses,
                    maxMarks: dto.maxMarks,
                    passMarks: dto.passMarks,
                    isOptional: dto.isOptional,
                    hasLab: dto.hasLab,
                    excludeFromGPA: dto.excludeFromGPA
                })),
                skipDuplicates: true
            });

            this.logger.log(`[School ${schoolId}] Assignment complete. Sections assigned: ${count.count}`);
            return { message: `Assigned to ${count.count} sections.` };
        } catch (error) {
            this.logger.error(`[School ${schoolId}] Bulk assignment failed`, error.stack);
            throw new BadRequestException('Failed to assign subjects to sections');
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

        return this.prisma.classSubject.findMany({
            where,
            include: {
                subject: true,
                class: { select: { name: true } },
                section: { select: { name: true } }
            }
        });
    }

    async updateClassSubject(schoolId: number, id: number, dto: UpdateClassSubjectDto) {
        this.logger.log(`Updating class subject ${id}`);
        const cs = await this.prisma.classSubject.findFirst({
            where: { id, schoolId }
        });
        if (!cs) throw new NotFoundException('Class Subject configuration not found');

        return this.prisma.classSubject.update({
            where: { id },
            data: dto
        });
    }

    async removeClassSubject(schoolId: number, id: number) {
        this.logger.log(`Removing class subject ${id}`);
        const cs = await this.prisma.classSubject.findFirst({
            where: { id, schoolId }
        });
        if (!cs) throw new NotFoundException('Class Subject configuration not found');

        return this.prisma.classSubject.delete({ where: { id } });
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

    async createCategory(schoolId: number, dto: CreateCategoryDto) {
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

        return this.prisma.subjectCategory.create({
            data: { ...dto, schoolId }
        });
    }

    async findAllCategories(schoolId: number) {
        return this.prisma.subjectCategory.findMany({
            where: { schoolId }
        });
    }

    async updateCategory(schoolId: number, id: number, dto: UpdateCategoryDto) {
        const cat = await this.prisma.subjectCategory.findFirst({ where: { id, schoolId } });
        if (!cat) throw new NotFoundException('Category not found');

        return this.prisma.subjectCategory.update({ where: { id }, data: dto });
    }

    async removeCategory(schoolId: number, id: number) {
        const cat = await this.prisma.subjectCategory.findFirst({ where: { id, schoolId } });
        if (!cat) throw new NotFoundException('Category not found');

        try {
            return await this.prisma.subjectCategory.delete({ where: { id } });
        } catch (e) {
            throw new BadRequestException('Cannot delete category in use');
        }
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
}
