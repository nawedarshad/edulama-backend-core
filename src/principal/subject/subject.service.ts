import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto, CreateClassSubjectDto, UpdateClassSubjectDto } from './dto/subject.dto';
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
            this.logger.error(`No active academic year found for school ${schoolId}`);
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

    async findAll(schoolId: number, query: any) {
        this.logger.log(`Fetching subjects for school ${schoolId} with query: ${JSON.stringify(query)}`);
        const { page = 1, limit = 10, search, departmentId } = query;
        const skip = (page - 1) * limit;

        const where: any = { schoolId };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (departmentId) {
            where.departmentId = Number(departmentId);
        }

        const [data, total] = await Promise.all([
            this.prisma.subject.findMany({
                where,
                include: { department: true },
                orderBy: { name: 'asc' },
                skip: Number(skip),
                take: Number(limit),
            }),
            this.prisma.subject.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / limit),
            }
        };
    }

    async findOne(schoolId: number, id: number) {
        const subject = await this.prisma.subject.findFirst({
            where: { id, schoolId },
            include: { department: true }
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
        this.logger.log(`Removing subject ${id} in school ${schoolId}`);
        await this.findOne(schoolId, id);
        try {
            const deleted = await this.prisma.subject.delete({ where: { id } });
            this.logger.log(`Subject deleted: ${id}`);
            return deleted;
        } catch (e) {
            this.logger.error(`Failed to delete subject ${id}`, e.stack);
            throw new BadRequestException('Cannot delete subject that is in use');
        }
    }

    // ==================================================================
    // 2. CLASS SPECIFIC CONFIGURATION (ClassSubject)
    // ==================================================================

    async assignToClass(schoolId: number, dto: CreateClassSubjectDto) {
        this.logger.log(`Assigning subject ${dto.subjectId} to class ${dto.classId} in school ${schoolId}`);
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

        const stats = { success: 0, failed: 0 };

        await Promise.all(sectionsToAssign.map(async (section) => {
            try {
                const classSubjectCode = dto.classSubjectCode || `${subject.code}-${section.id}`;
                await this.prisma.classSubject.create({
                    data: {
                        schoolId,
                        academicYearId: academicYear.id,
                        classId: dto.classId,
                        sectionId: section.id,
                        subjectId: dto.subjectId,
                        classSubjectCode,
                        type: dto.type,
                        credits: dto.credits,
                        weeklyClasses: dto.weeklyClasses,
                        maxMarks: dto.maxMarks,
                        passMarks: dto.passMarks,
                        isOptional: dto.isOptional,
                        hasLab: dto.hasLab,
                        excludeFromGPA: dto.excludeFromGPA,
                    }
                });
                stats.success++;
            } catch (error) {
                this.logger.warn(`Failed to assign to section ${section.id}: ${error.message}`);
                stats.failed++;
            }
        }));

        this.logger.log(`Assignment complete. Success: ${stats.success}, Failed: ${stats.failed}`);
        return { message: `Assigned to ${stats.success} sections. Failed/Skipped: ${stats.failed}` };
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
    // 3. STATS
    // ==================================================================

    async getStats(schoolId: number) {
        const academicYear = await this.getActiveAcademicYear(schoolId);

        const totalSubjects = await this.prisma.subject.count({
            where: { schoolId }
        });

        const assignedSubjects = await this.prisma.classSubject.count({
            where: { schoolId, academicYearId: academicYear.id }
        });

        return {
            totalSubjects,
            assignedSubjects,
            categoryStats: []
        };
    }

    // ==================================================================
    // 4. CATEGORIES
    // ==================================================================

    async createCategory(schoolId: number, dto: any) {
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

    async updateCategory(schoolId: number, id: number, dto: any) {
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
        this.logger.log(`Exporting subjects for school ${schoolId}`);
        const subjects = await this.prisma.subject.findMany({
            where: { schoolId },
            include: { department: true }
        });

        const header = "ID,Name,Code,Department\n";
        const rows = subjects.map(s => `${s.id},${s.name},${s.code},${s.department?.name || ''}`).join("\n");
        return header + rows;
    }

    async exportClassSubjects(schoolId: number) {
        this.logger.log(`Exporting class subjects for school ${schoolId}`);
        const academicYear = await this.getActiveAcademicYear(schoolId);
        const cs = await this.prisma.classSubject.findMany({
            where: { schoolId, academicYearId: academicYear.id },
            include: { class: true, section: true, subject: true }
        });
        const header = "Class,Section,Subject,Code,Credits\n";
        const rows = cs.map(c => `${c.class.name},${c.section.name},${c.subject.name},${c.classSubjectCode},${c.credits || 0}`).join("\n");
        return header + rows;
    }
}
