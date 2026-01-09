import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentFilterDto } from './dto/student-filter.dto';
import { MarkStudentLeftDto } from './dto/mark-student-left.dto';
import { Prisma, Religion, BloodGroup, Caste, StudentCategory } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class StudentService {
    private readonly logger = new Logger(StudentService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(
        schoolId: number,
        academicYearId: number,
        dto: CreateStudentDto,
    ) {
        this.logger.log(`Creating student for school ${schoolId}, year ${academicYearId}: ${dto.fullName}`);

        // 1. Check for duplicate Admission No in the same school & year
        const existingStudent = await this.prisma.studentProfile.findFirst({
            where: {
                schoolId,
                academicYearId,
                admissionNo: dto.admissionNo,
            },
        });

        if (existingStudent) {
            this.logger.warn(`Duplicate Admission No ${dto.admissionNo} in school ${schoolId}`);
            throw new BadRequestException(
                `Student with Admission No ${dto.admissionNo} already exists for this academic year.`,
            );
        }

        // 2. Check for duplicate Parent Email (Strict check: New parent creation only)
        // Verify if a parent with this email already exists in the system or school
        // Assuming unique email per school for parents for simplicity or global uniqueness?
        // Let's assume global uniqueness for AuthIdentity type EMAIL
        const existingParentAuth = await this.prisma.authIdentity.findFirst({
            where: {
                schoolId,
                type: 'EMAIL',
                value: dto.parent.fatherEmail,
            }
        });

        if (existingParentAuth) {
            this.logger.warn(`Duplicate Parent Email ${dto.parent.fatherEmail}`);
            throw new BadRequestException(
                `Parent with email ${dto.parent.fatherEmail} already exists.`,
            );
        }

        // 3. Fetch Roles
        const studentRole = await this.prisma.role.findUnique({ where: { name: 'STUDENT' } });
        const parentRole = await this.prisma.role.findUnique({ where: { name: 'PARENT' } });

        if (!studentRole || !parentRole) {
            this.logger.error('Roles STUDENT or PARENT not found in DB');
            throw new BadRequestException(
                "Roles 'STUDENT' and/or 'PARENT' not found. Please seed the database.",
            );
        }

        // 4. Prepare Credentials
        // Student:
        // Username: FirstName + AdmissionNo (lowercase)
        const firstName = dto.fullName.split(' ')[0].toLowerCase();
        const studentUsername = `${firstName}${dto.admissionNo}`;
        // Password: DOB (DDMMYYYY)
        if (!dto.dob) throw new BadRequestException('Student DOB is required for password generation.');

        const dobDate = new Date(dto.dob);
        const day = String(dobDate.getDate()).padStart(2, '0');
        const month = String(dobDate.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const year = dobDate.getFullYear();

        const studentPasswordRaw = `${day}${month}${year}`;

        const studentPasswordHash = await argon2.hash(studentPasswordRaw);

        // Parent:
        // Username: fatherEmail (handled by AuthIdentity type EMAIL)
        const parentEmail = dto.parent.fatherEmail;
        // Password: Student DOB
        const parentPasswordHash = await argon2.hash(studentPasswordRaw); // Same password as student

        // 5. Transactional Create
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                // =========================================
                // A. CREATE STUDENT
                // =========================================

                // A1. Create Student User
                const studentUser = await tx.user.create({
                    data: {
                        schoolId,
                        roleId: studentRole.id,
                        name: dto.fullName,
                        photo: dto.photo,
                        isActive: true,
                        // Create Auth Identity for Username
                        authIdentities: {
                            create: {
                                schoolId,
                                type: 'USERNAME',
                                value: studentUsername,
                                secret: studentPasswordHash,
                                verified: true, // Auto-verified for internal creation
                            }
                        }
                    },
                });

                // A2. Create Student Profile
                const student = await tx.studentProfile.create({
                    data: {
                        userId: studentUser.id,
                        schoolId,
                        academicYearId,
                        admissionNo: dto.admissionNo,
                        rollNo: dto.rollNo,
                        fullName: dto.fullName,
                        photo: dto.photo,
                        dob: dto.dob ? new Date(dto.dob) : null,
                        admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : null,
                        classId: dto.classId,
                        sectionId: dto.sectionId,
                        houseId: dto.houseId,

                        personalInfo: dto.personalInfo ? {
                            create: {
                                ...dto.personalInfo,
                                religion: dto.personalInfo.religion as any, // Cast to match Prisma Enum
                                bloodGroup: dto.personalInfo.bloodGroup as any,
                                caste: dto.personalInfo.caste as any,
                                category: dto.personalInfo.category as any
                            }
                        } : undefined,
                        documents: dto.documents ? { create: dto.documents } : undefined,
                        previousEducation: dto.previousEducation ? { create: dto.previousEducation } : undefined,
                        healthRecord: dto.healthRecord ? { create: dto.healthRecord } : undefined,
                    },
                });

                // =========================================
                // B. CREATE PARENT
                // =========================================

                // B1. Create Parent User
                // Use Father's name as primary name for the User account
                const parentName = dto.parent.fatherName;

                const parentUser = await tx.user.create({
                    data: {
                        schoolId,
                        roleId: parentRole.id,
                        name: parentName,
                        isActive: true,
                        // Create Auth Identity for Email
                        authIdentities: {
                            create: {
                                schoolId,
                                type: 'EMAIL',
                                value: parentEmail,
                                secret: parentPasswordHash,
                                verified: true, // Assuming verifying email mostly for self-sign-up, let's mark verified
                            }
                        }
                    },
                });

                // B2. Create Parent Profile
                const parentProfile = await tx.parentProfile.create({
                    data: {
                        userId: parentUser.id,
                        // Map DTO fields
                        fatherName: dto.parent.fatherName,
                        fatherEmail: dto.parent.fatherEmail,
                        fatherContact: dto.parent.fatherContact,
                        fatherOccupation: dto.parent.fatherOccupation,
                        motherName: dto.parent.motherName,
                        motherEmail: dto.parent.motherEmail,
                        motherContact: dto.parent.motherContact,
                        motherOccupation: dto.parent.motherOccupation,
                        guardianName: dto.parent.guardianName,
                        guardianContact: dto.parent.guardianContact,
                        guardianRelation: dto.parent.guardianRelation,
                        emergencyContact: dto.parent.emergencyContact,
                        annualIncome: dto.parent.annualIncome,
                        permanentAddress: dto.parent.permanentAddress,
                    }
                });

                // =========================================
                // C. LINK STUDENT AND PARENT
                // =========================================

                await tx.parentStudent.create({
                    data: {
                        parentId: parentProfile.id,
                        studentId: student.id,
                        relation: 'FATHER', // Default/Primary relation
                    }
                });

                return {
                    studentId: student.id,
                    parentId: parentProfile.id,
                    username: studentUsername,
                    message: 'Student and Parent profiles created successfully',
                };
            });
            this.logger.log(`Student created successfully: ${result.studentId}`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to create student in school ${schoolId}`, error.stack);
            throw error;
        }
    }

    async findAll(
        schoolId: number,
        academicYearId: number,
        filters: StudentFilterDto,
    ) {
        this.logger.log(`Fetching students for school ${schoolId}, year ${academicYearId}`);
        const {
            page = 1,
            limit = 10,
            classId,
            sectionId,
            admissionNo,
            name,
            gender,
            caste,
            category,
            religion,
        } = filters;

        const skip = (page - 1) * limit;

        const where: Prisma.StudentProfileWhereInput = {
            schoolId,
            academicYearId,
            // leftDate: null, // Removed to allow frontend to filter left students
            ...(classId && { classId }),
            ...(sectionId && { sectionId }),
            ...(admissionNo && { admissionNo: { contains: admissionNo } }), // Partial match
            ...(name && { fullName: { contains: name, mode: 'insensitive' } }), // Case insensitive match
            // Advanced Filters inside relations
            ...(gender || caste || category || religion
                ? {
                    personalInfo: {
                        ...(gender ? { gender } : {}),
                        ...(caste ? { caste: caste as Caste } : {}),
                        ...(category ? { category: category as StudentCategory } : {}),
                        ...(religion ? { religion: religion as Religion } : {}),
                    },
                }
                : {}),
        };

        const [data, total] = await Promise.all([
            this.prisma.studentProfile.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                include: {
                    class: true,
                    section: true,
                    personalInfo: true,
                    house: true,
                },
                orderBy: { admissionNo: 'asc' },
            }),
            this.prisma.studentProfile.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: number, schoolId: number) {
        const student = await this.prisma.studentProfile.findUnique({
            where: { id },
            include: {
                class: true,
                section: true,
                personalInfo: true,
                documents: true,
                previousEducation: true,
                healthRecord: true,
                house: true,
                parents: {
                    include: {
                        parent: true,
                    }
                },
            },
        });

        if (!student || student.schoolId !== schoolId) {
            this.logger.warn(`Student not found or access denied: ${id} in school ${schoolId}`);
            throw new NotFoundException('Student not found');
        }

        return student;
    }

    async update(id: number, schoolId: number, dto: UpdateStudentDto) {
        this.logger.log(`Updating student ${id} in school ${schoolId}`);
        // Check existence
        await this.findOne(id, schoolId);

        try {
            const updated = await this.prisma.studentProfile.update({
                where: { id },
                data: {
                    fullName: dto.fullName,
                    admissionNo: dto.admissionNo,
                    rollNo: dto.rollNo,
                    dob: dto.dob ? new Date(dto.dob) : undefined,
                    admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : undefined,
                    classId: dto.classId,
                    sectionId: dto.sectionId,
                    houseId: dto.houseId,
                    photo: dto.photo,

                    personalInfo: dto.personalInfo
                        ? {
                            upsert: {
                                create: {
                                    ...dto.personalInfo,
                                    religion: dto.personalInfo.religion as any,
                                    bloodGroup: dto.personalInfo.bloodGroup as any,
                                    caste: dto.personalInfo.caste as any,
                                    category: dto.personalInfo.category as any
                                },
                                update: {
                                    ...dto.personalInfo,
                                    religion: dto.personalInfo.religion as any,
                                    bloodGroup: dto.personalInfo.bloodGroup as any,
                                    caste: dto.personalInfo.caste as any,
                                    category: dto.personalInfo.category as any
                                },
                            },
                        }
                        : undefined,

                    healthRecord: dto.healthRecord
                        ? {
                            upsert: {
                                create: dto.healthRecord,
                                update: dto.healthRecord,
                            },
                        }
                        : undefined,

                    documents: dto.documents
                        ? {
                            create: dto.documents,
                        }
                        : undefined,

                    previousEducation: dto.previousEducation
                        ? {
                            create: dto.previousEducation,
                        }
                        : undefined,
                },
                include: {
                    personalInfo: true,
                    documents: true,
                    previousEducation: true,
                    healthRecord: true,
                },
            });
            this.logger.log(`Student updated successfully: ${id}`);
            return updated;
        } catch (error) {
            this.logger.error(`Failed to update student ${id}`, error.stack);
            throw error;
        }
    }

    async remove(id: number, schoolId: number) {
        this.logger.log(`Deleting student ${id} in school ${schoolId}`);
        const student = await this.findOne(id, schoolId);

        // We should delete the User to clean up identity?
        try {
            const deleted = await this.prisma.user.delete({
                where: { id: student.userId },
            });
            this.logger.log(`Student deleted: ${id} (User: ${student.userId})`);
            return deleted;
        } catch (error) {
            this.logger.error(`Failed to delete student ${id}`, error.stack);
            throw new BadRequestException('Cannot delete student');
        }
    }

    // ---------------------------------------------------
    // ANALYTICS
    // ---------------------------------------------------
    async markAsLeft(schoolId: number, id: number, dto: MarkStudentLeftDto) {
        this.logger.log(`Marking student ${id} as left in school ${schoolId}`);

        const student = await this.prisma.studentProfile.findFirst({
            where: { id, schoolId },
            include: {
                user: true,
                parents: {
                    include: {
                        parent: true
                    }
                }
            }
        });

        if (!student) {
            throw new NotFoundException(`Student with ID ${id} not found`);
        }

        const leftDate = dto.leftDate ? new Date(dto.leftDate) : new Date();

        try {
            // Transaction to update both StudentProfile and User
            await this.prisma.$transaction(async (tx) => {
                // 1. Update Student Profile
                await tx.studentProfile.update({
                    where: { id },
                    data: {
                        isActive: false,
                        leftDate: leftDate,
                        leavingReason: dto.reason,
                    },
                });

                // 2. Deactivate Student User
                await tx.user.update({
                    where: { id: student.userId },
                    data: { isActive: false },
                });

                // 3. Deactivate Parents
                // "When someone is marked left only they are marked inactive their parents should also be marked as inactive"
                if (student.parents && student.parents.length > 0) {
                    for (const parentStudent of student.parents) {
                        const parentProfile = parentStudent.parent;
                        if (parentProfile && parentProfile.userId) {
                            await tx.user.update({
                                where: { id: parentProfile.userId },
                                data: { isActive: false }
                            });
                            await tx.parentProfile.update({
                                where: { id: parentProfile.id },
                                // Logic for deactivating parent profile if such field existed, 
                                // but typically User.isActive controls login access.
                                // Assuming we only need to stop login.
                                data: {}
                            });
                        }
                    }
                }
            });

            this.logger.log(`Student ${id} marked as left successfully`);
            return { message: 'Student marked as left and deactivated successfully' };

        } catch (error) {
            this.logger.error(`Error marking student ${id} as left`, error.stack);
            throw new InternalServerErrorException('Failed to mark student as left');
        }
    }

    async getAnalytics(schoolId: number, academicYearId?: number) {
        this.logger.log(`Fetching student analytics for school ${schoolId}, year ${academicYearId}`);
        const baseWhere = { schoolId, academicYearId, leftDate: null };

        // 1. Total Count
        const totalStudents = await this.prisma.studentProfile.count({ where: baseWhere });

        // 2. Gender Distribution
        const genderDistribution = await this.prisma.studentPersonalInfo.groupBy({
            by: ['gender'],
            where: {
                student: baseWhere
            },
            _count: {
                gender: true
            }
        });

        // 3. Class-wise Distribution
        const classDistribution = await this.prisma.studentProfile.groupBy({
            by: ['classId'],
            where: baseWhere,
            _count: {
                id: true
            }
        });
        // Hydrate Class Names
        const classIds = classDistribution.map(c => c.classId);
        const classes = await this.prisma.class.findMany({
            where: { id: { in: classIds } },
            select: { id: true, name: true }
        });
        const classStats = classDistribution.map(cd => ({
            className: classes.find(c => c.id === cd.classId)?.name || 'Unknown',
            count: cd._count.id
        }));

        // 4. Category/Caste Distribution
        const categoryDistribution = await this.prisma.studentPersonalInfo.groupBy({
            by: ['category'],
            where: {
                student: baseWhere
            },
            _count: { category: true }
        });

        // 5. Religion Distribution
        const religionDistribution = await this.prisma.studentPersonalInfo.groupBy({
            by: ['religion'],
            where: {
                student: baseWhere
            },
            _count: { religion: true }
        });

        // 6. Section-wise capacity vs occupancy (Need Section Capacities)
        // Getting sections heavily occupied

        // 7. New Admissions (Month wise in current Academic Year)
        // This requires raw query or JS processing. Prisma groupBy date is not direct.
        // Let's fetch admissionDate and process in JS (Simpler for now)
        const admissions = await this.prisma.studentProfile.findMany({
            where: baseWhere,
            select: { admissionDate: true }
        });

        const admissionsByMonth = {};
        admissions.forEach(curr => {
            if (!curr.admissionDate) return;
            const month = curr.admissionDate.toLocaleString('default', { month: 'short' });
            admissionsByMonth[month] = (admissionsByMonth[month] || 0) + 1;
        });

        return {
            totalStudents,
            genderDistribution,
            classStats,
            categoryDistribution,
            religionDistribution,
            admissionsByMonth
        };
    }
}
