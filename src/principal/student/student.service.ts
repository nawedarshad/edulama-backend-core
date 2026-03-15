import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto, CreateGuardianDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentFilterDto } from './dto/student-filter.dto';
import { MarkStudentLeftDto } from './dto/mark-student-left.dto';
import { Prisma, Religion, BloodGroup, Caste, StudentCategory } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class StudentService {
    private readonly logger = new Logger(StudentService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ==========================
    // PARENT LOOKUP
    // ==========================

    async lookupParentByContact(contact: string, schoolId: number) {
        if (!contact) return { exists: false };

        const normalizedContact = contact.toLowerCase().trim();
        const type = contact.includes('@') ? 'EMAIL' : 'PHONE';

        const identity = await this.prisma.authIdentity.findFirst({
            where: { type, value: normalizedContact },
            include: {
                user: {
                    include: {
                        userSchools: {
                            where: { schoolId },
                            include: { primaryRole: true, roles: { include: { role: true } } },
                        },
                        parentProfile: true,
                        authIdentities: true,
                    },
                },
            },
        }) as any;

        if (!identity?.user) return { exists: false };

        const user = identity.user;
        const alreadyLinkedToSchool = user.userSchools.length > 0 && user.userSchools[0]?.isActive;

        const phoneIdentity = user.authIdentities?.find((ai: any) => ai.type === 'PHONE');
        const maskedPhone = phoneIdentity ? `******${phoneIdentity.value.slice(-4)}` : null;

        return {
            exists: true,
            userId: user.id,
            name: user.name,
            contact: normalizedContact,
            photo: user.photo ?? null,
            alreadyLinkedToSchool,
            roles: user.userSchools[0]?.primaryRole?.name || user.userSchools[0]?.roles?.[0]?.role?.name || null,
            parentProfile: user.parentProfile,
            maskedPhone,
        };
    }

    // ==========================
    // CREATE STUDENT
    // ==========================

    async create(
        schoolId: number,
        academicYearId: number,
        dto: CreateStudentDto,
    ) {
        this.logger.log(`Creating student for school ${schoolId}, year ${academicYearId}: ${dto.fullName}`);

        // 1. Check for duplicate Admission No
        const existingStudent = await this.prisma.studentProfile.findFirst({
            where: { schoolId, academicYearId, admissionNo: dto.admissionNo },
        });
        if (existingStudent) {
            throw new BadRequestException(`Student with Admission No ${dto.admissionNo} already exists for this academic year.`);
        }

        // 2. Valiation Checks
        if (dto.dob) {
            const dob = new Date(dto.dob);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const m = today.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            if (age < 2 || age > 25) {
                throw new BadRequestException('Student age must be between 2 and 25 years.');
            }
            if (dob > today) {
                throw new BadRequestException('DOB cannot be in the future.');
            }
            if (dto.admissionDate) {
                const admissionDate = new Date(dto.admissionDate);
                if (admissionDate < dob) {
                    throw new BadRequestException('Admission date cannot be before DOB.');
                }
                if (admissionDate > today) {
                    throw new BadRequestException('Admission date cannot be in the future.');
                }
            }
        }

        const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
        if (section && section.capacity) {
            const currentStudents = await this.prisma.studentProfile.count({
                where: { sectionId: dto.sectionId, isActive: true }
            });
            if (currentStudents >= section.capacity) {
                throw new BadRequestException(`Section capacity (${section.capacity}) is full.`);
            }
        }

        const fatherGuardian = dto.guardians?.find(g => g.relation === 'FATHER');
        if (dto.dob && fatherGuardian?.phone) {
            const duplicate = await this.prisma.studentProfile.findFirst({
                where: {
                    fullName: dto.fullName,
                    dob: new Date(dto.dob),
                    parents: {
                        some: {
                            parent: { fatherContact: fatherGuardian.phone }
                        }
                    }
                }
            });
            if (duplicate) {
                throw new BadRequestException('A student with the same name, DOB, and father contact already exists.');
            }
        }

        // 3. Fetch Roles
        const [studentRole, parentRole] = await Promise.all([
            this.prisma.role.findUnique({ where: { name: 'STUDENT' } }),
            this.prisma.role.findUnique({ where: { name: 'PARENT' } }),
        ]);
        if (!studentRole || !parentRole) {
            throw new BadRequestException("Roles 'STUDENT' and/or 'PARENT' not found. Please seed the database.");
        }

        // 4. Prepare student credentials
        const firstName = dto.fullName.split(' ')[0].toLowerCase();
        const studentUsername = `${firstName}${dto.admissionNo}`;
        if (!dto.dob) throw new BadRequestException('Student DOB is required for password generation.');

        const dobDate = new Date(dto.dob);
        const studentPasswordRaw = [
            String(dobDate.getDate()).padStart(2, '0'),
            String(dobDate.getMonth() + 1).padStart(2, '0'),
            dobDate.getFullYear(),
        ].join('');
        const studentPasswordHash = await argon2.hash(studentPasswordRaw);

        // 5. Transactional create
        try {
            const result = await this.prisma.$transaction(async (tx) => {

                // ── A. STUDENT ──────────────────────────────────────────────

                // A1. Create Student Profile (skipping login User creation)
                const student = await tx.studentProfile.create({
                    data: {
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
                                religion: dto.personalInfo.religion as any,
                                bloodGroup: dto.personalInfo.bloodGroup as any,
                                caste: dto.personalInfo.caste as any,
                                category: dto.personalInfo.category as any,
                            },
                        } : undefined,
                        documents: dto.documents ? { create: dto.documents } : undefined,
                        previousEducation: dto.previousEducation ? { create: dto.previousEducation } : undefined,
                        healthRecord: dto.healthRecord ? { create: dto.healthRecord } : undefined,
                    },
                });

                // ── B. GUARDIANS (FAMILY) ─────────────────────────────────────────────

                let familyUserId: number | null = null;

                // B1. Determine if any provided email/phone already belongs to a user
                const normalizedPrimaryEmail = dto.primaryEmail?.toLowerCase().trim();
                const queries: any[] = [];
                if (normalizedPrimaryEmail) queries.push({ type: 'EMAIL', value: normalizedPrimaryEmail });

                for (const guardian of dto.guardians ?? []) {
                    if (guardian.phone) {
                        queries.push({ type: 'PHONE', value: guardian.phone });
                    }
                }

                if (queries.length > 0) {
                    const existingIdentity = await tx.authIdentity.findFirst({
                        where: { OR: queries },
                    });
                    if (existingIdentity) {
                        familyUserId = existingIdentity.userId;
                    }
                }

                // B2. Create or Link User
                let parentUser: any;
                if (!familyUserId) {
                    // new family user -> OTP first logic (no password, inactive until verification)
                    parentUser = await tx.user.create({
                        data: { name: dto.guardians?.[0]?.name || 'Parent', isActive: false },
                    });
                    familyUserId = parentUser.id;

                    // Add primary email identity
                    if (normalizedPrimaryEmail) {
                        await tx.authIdentity.upsert({
                            where: { type_value: { type: 'EMAIL', value: normalizedPrimaryEmail } },
                            create: { userId: familyUserId!, type: 'EMAIL', value: normalizedPrimaryEmail, verified: true },
                            update: {}
                        });
                    }

                    // Add phone identities
                    for (const guardian of dto.guardians ?? []) {
                        if (guardian.phone) {
                            await tx.authIdentity.upsert({
                                where: { type_value: { type: 'PHONE', value: guardian.phone } },
                                create: { userId: familyUserId!, type: 'PHONE', value: guardian.phone, verified: true },
                                update: {}
                            });
                        }
                    }
                } else {
                    parentUser = await tx.user.findUnique({ where: { id: familyUserId } });
                }

                // B3. Assign Role to School
                const existingParentMembership = await tx.userSchool.findUnique({
                    where: { userId_schoolId: { userId: familyUserId!, schoolId } },
                });
                if (!existingParentMembership) {
                    const pm = await tx.userSchool.create({
                        data: { userId: familyUserId!, schoolId, primaryRoleId: parentRole.id, isActive: true },
                    });
                    await tx.userSchoolRole.create({
                        data: { userSchoolId: pm.id, roleId: parentRole.id },
                    });
                } else if (!existingParentMembership.isActive) {
                    await tx.userSchool.update({
                        where: { id: existingParentMembership.id },
                        data: { isActive: true },
                    });
                }

                // B4. Create or Update Family ParentProfile
                const father = dto.guardians?.find(g => g.relation === 'FATHER');
                const mother = dto.guardians?.find(g => g.relation === 'MOTHER');
                const guardianOther = dto.guardians?.find(g => g.relation === 'GUARDIAN');

                const profileData = {
                    fatherName: father?.name,
                    fatherContact: father?.phone,
                    fatherOccupation: father?.occupation,
                    motherName: mother?.name,
                    motherContact: mother?.phone,
                    motherOccupation: mother?.occupation,
                    guardianName: guardianOther?.name,
                    guardianContact: guardianOther?.phone,
                    guardianRelation: guardianOther?.relation,
                    primaryEmail: normalizedPrimaryEmail,
                    emergencyContact: father?.phone || mother?.phone || guardianOther?.phone,
                };

                let parentProfile = await tx.parentProfile.findUnique({
                    where: { userId: familyUserId! },
                });

                if (!parentProfile) {
                    parentProfile = await tx.parentProfile.create({
                        data: {
                            userId: familyUserId!,
                            ...profileData,
                        },
                    });
                } else {
                    parentProfile = await tx.parentProfile.update({
                        where: { id: parentProfile.id },
                        data: profileData,
                    });
                }

                // B5. Link to Student
                const primaryRelation = father ? 'FATHER' : (mother ? 'MOTHER' : 'GUARDIAN');
                await tx.parentStudent.create({
                    data: {
                        parentId: parentProfile.id,
                        studentId: student.id,
                        relation: primaryRelation,
                    },
                });

                return {
                    studentId: student.id,
                    parentProfileId: parentProfile.id,
                    message: `Student and family linked successfully`,
                };
            });

            this.logger.log(`Student created: ${result.studentId}, familyId: ${result.parentProfileId}`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to create student in school ${schoolId}`, error.stack);
            throw error;
        }
    }

    // ==========================
    // GENERATE CREDENTIALS
    // ==========================

    async generateCredentials(
        schoolId: number,
        academicYearId: number,
        classId?: number,
        sectionId?: number,
        verifyStudents: boolean = true,
        verifyParents: boolean = true,
    ) {
        this.logger.log(`Bulk verification for school ${schoolId}, year ${academicYearId}. Target: Students=${verifyStudents}, Parents=${verifyParents}`);

        // 1. Fetch STUDENT/PARENT roles
        const [studentRole, parentRole] = await Promise.all([
            this.prisma.role.findUnique({ where: { name: 'STUDENT' } }),
            this.prisma.role.findUnique({ where: { name: 'PARENT' } }),
        ]);

        if (!studentRole || !parentRole) {
            throw new BadRequestException("Roles 'STUDENT' and/or 'PARENT' not found.");
        }

        const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
        if (!school) {
            throw new BadRequestException("School not found");
        }
        const schoolCode = school.code.toLowerCase();

        // 2. Find students and their families
        const where: any = {
            schoolId,
            academicYearId,
            isActive: true,
        };
        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;

        const students = await this.prisma.studentProfile.findMany({
            where,
            include: {
                parents: {
                    include: {
                        parent: {
                            include: {
                                user: true
                            }
                        }
                    }
                }
            }
        });

        this.logger.log(`Filtering for verification in class scope: found ${students.length} students`);

        let studentsProvisioned = 0;
        let parentsActivated = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Track processed user IDs to avoid duplicate processing in the same call
        const processedUserIds = new Set<number>();

        for (const student of students) {
            try {
                // --- A. Process Student ---
                if (verifyStudents && !student.userId) {
                    if (!student.dob) {
                        skipped++;
                        errors.push(`Student ${student.fullName} (${student.admissionNo}): skipped — no DOB set`);
                    } else {
                        const firstName = student.fullName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                        const username = `${firstName}${student.admissionNo.toLowerCase()}`;

                        const dobDate = new Date(student.dob);
                        const passwordRaw = [
                            String(dobDate.getDate()).padStart(2, '0'),
                            String(dobDate.getMonth() + 1).padStart(2, '0'),
                            dobDate.getFullYear(),
                        ].join('');
                        const passwordHash = await argon2.hash(passwordRaw);

                        await this.prisma.$transaction(async (tx) => {
                            const user = await tx.user.create({
                                data: { name: student.fullName, isActive: true },
                            });
                            const identityValue = `${username}@${schoolCode}`;
                            await tx.authIdentity.upsert({
                                where: { type_value: { type: 'USERNAME', value: identityValue } },
                                create: { userId: user.id, type: 'USERNAME', value: identityValue, secret: passwordHash, verified: true, schoolId },
                                update: { schoolId },
                            });
                            const membership = await tx.userSchool.create({
                                data: { userId: user.id, schoolId, primaryRoleId: studentRole.id, isActive: true },
                            });
                            await tx.userSchoolRole.create({
                                data: { userSchoolId: membership.id, roleId: studentRole.id },
                            });
                            await tx.studentProfile.update({
                                where: { id: student.id },
                                data: { userId: user.id },
                            });
                        });
                        studentsProvisioned++;
                    }
                }

                // --- B. Process Parents ---
                if (verifyParents) {
                    for (const studentParent of student.parents) {
                        const parent = studentParent.parent;
                        if (parent.user && !parent.user.isActive && !processedUserIds.has(parent.userId)) {
                            await this.prisma.$transaction(async (tx) => {
                                // Activate user
                                await tx.user.update({
                                    where: { id: parent.userId },
                                    data: { isActive: true }
                                });
                                // Verify all identities (EMAIL/PHONE)
                                await tx.authIdentity.updateMany({
                                    where: { userId: parent.userId },
                                    data: { verified: true }
                                });
                            });
                            parentsActivated++;
                            processedUserIds.add(parent.userId);
                        }
                    }
                }

            } catch (err: any) {
                this.logger.error(`Error processing ${student.admissionNo}: ${err.message}`);
                errors.push(`${student.fullName} (${student.admissionNo}): ${err.message}`);
            }
        }

        return {
            total: students.length,
            provisioned: studentsProvisioned,
            parentsActivated,
            skipped,
            errors,
            message: `${studentsProvisioned} student account(s) created, ${parentsActivated} parent account(s) activated, ${skipped} skipped.`,
        };
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
            houseId,
            isActive,
            isRTE,
            isDisabled,
        } = filters;

        const skip = (page - 1) * limit;

        const where: Prisma.StudentProfileWhereInput = {
            schoolId,
            academicYearId,
            ...(classId && { classId }),
            ...(sectionId && { sectionId }),
            ...(houseId && { houseId }),
            ...(isActive === 'true' && { isActive: true }),
            ...(isActive === 'false' && { isActive: false }),
            ...(admissionNo && { admissionNo: { contains: admissionNo } }), // Partial match
            ...(name && { fullName: { contains: name, mode: 'insensitive' } }), // Case insensitive match
            // Advanced Filters inside relations
            ...(gender || caste || category || religion || isRTE !== undefined || isDisabled !== undefined
                ? {
                    personalInfo: {
                        ...(gender ? { gender } : {}),
                        ...(caste ? { caste: caste as Caste } : {}),
                        ...(category ? { category: category as StudentCategory } : {}),
                        ...(religion ? { religion: religion as Religion } : {}),
                        ...(isRTE === true ? { category: 'RTE' } : {}),
                        ...(isDisabled !== undefined ? { isDisabled } : {}),
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


        if (!student) {
            this.logger.warn(`Student not found: ID ${id}`);
            throw new NotFoundException('Student not found');
        }

        if (student.schoolId !== schoolId) {
            this.logger.warn(`Student found but school mismatch. ID: ${id}, Student School: ${student.schoolId}, Req School: ${schoolId}`);
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
        this.logger.log(`Performing full cascading removal for student ${id} in school ${schoolId}`);

        // 1. Fetch student with parents and user info for identifying what else to delete
        const student = await this.prisma.studentProfile.findUnique({
            where: { id },
            include: {
                parents: {
                    include: {
                        parent: true
                    }
                }
            }
        });

        if (!student || student.schoolId !== schoolId) {
            throw new NotFoundException('Student not found');
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                // 2. Identify parents to potentially delete
                const parentUserIdsToDelete: number[] = [];

                if (student.parents && student.parents.length > 0) {
                    for (const ps of student.parents) {
                        const parentId = ps.parentId;

                        // Check if this parent is linked to ANY other students in the entire system
                        const otherChildrenCount = await tx.parentStudent.count({
                            where: {
                                parentId: parentId,
                                studentId: { not: id }
                            }
                        });

                        if (otherChildrenCount === 0) {
                            // This parent has no other children, mark their User for deletion if they have one
                            if (ps.parent.userId) {
                                parentUserIdsToDelete.push(ps.parent.userId);
                            }
                        }
                    }
                }

                // 3. Delete non-cascading records for the student
                // AttendanceSummary: explicitly remove all records for this student profile
                await tx.attendanceSummary.deleteMany({
                    where: { studentId: id }
                });

                // AnnouncementAudience: explicitly remove targeting for this student
                await tx.announcementAudience.deleteMany({
                    where: { studentId: id }
                });

                // 4. Delete the student's User account or Profile
                // Deleting the User will cascade to ALL linked StudentProfiles and their related data
                if (student.userId) {
                    // Find all student profiles associated with this user to clean up their non-cascading summaries
                    const allProfiles = await tx.studentProfile.findMany({
                        where: { userId: student.userId },
                        select: { id: true }
                    });

                    const profileIds = allProfiles.map(p => p.id);

                    await tx.attendanceSummary.deleteMany({
                        where: { studentId: { in: profileIds } }
                    });

                    await tx.announcementAudience.deleteMany({
                        where: { studentId: { in: profileIds } }
                    });

                    // Now delete the top-level user
                    await tx.user.delete({
                        where: { id: student.userId }
                    });
                } else {
                    // No user account, just delete this specific profile (cascades to some, we handled others)
                    await tx.studentProfile.delete({
                        where: { id: id }
                    });
                }

                // 5. Delete Parent User accounts (only if they have no other children anywhere)
                for (const pUserId of parentUserIdsToDelete) {
                    const userExists = await tx.user.findUnique({
                        where: { id: pUserId }
                    });
                    if (userExists) {
                        await tx.user.delete({
                            where: { id: pUserId }
                        });
                    }
                }
            });

            this.logger.log(`Student ${id} and all associated records fully removed.`);
            return { message: 'Student and associated records fully removed from system' };
        } catch (error) {
            this.logger.error(`Failed to remove student ${id} records`, error.stack);
            throw new BadRequestException('Failed to remove student records: ' + (error.message || 'Unknown error'));
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

                // 2. Deactivate Student UserSchool Membership
                if (student.userId) {
                    await tx.userSchool.update({
                        where: {
                            userId_schoolId: {
                                userId: student.userId,
                                schoolId,
                            }
                        },
                        data: { isActive: false },
                    });
                }

                // 3. Deactivate Parents Membership
                if (student.parents && student.parents.length > 0) {
                    for (const parentStudent of student.parents) {
                        const parentProfile = parentStudent.parent;
                        if (parentProfile && parentProfile.userId) {
                            await tx.userSchool.update({
                                where: {
                                    userId_schoolId: {
                                        userId: parentProfile.userId,
                                        schoolId,
                                    }
                                },
                                data: { isActive: false }
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
        const [totalStudents, totalInactive, totalDisabled] = await Promise.all([
            this.prisma.studentProfile.count({ where: baseWhere }),
            this.prisma.studentProfile.count({
                where: {
                    schoolId,
                    academicYearId,
                    NOT: { leftDate: null }
                }
            }),
            this.prisma.studentPersonalInfo.count({
                where: {
                    student: { schoolId, academicYearId },
                    isDisabled: true
                }
            })
        ]);

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
            totalInactive,
            totalDisabled,
            genderDistribution,
            classStats,
            categoryDistribution,
            religionDistribution,
            admissionsByMonth
        };
    }
}
