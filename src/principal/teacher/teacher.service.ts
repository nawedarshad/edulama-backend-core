import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
    CreateTeacherDto,
    CreateDocumentDto,
    CreateQualificationDto,
    CreateCertificationDto,
    CreateTrainingDto,
    CreateResponsibilityDto,
    CreateAppraisalDto,
    UpsertSalaryConfigDto,
    UpsertBankAccountDto
} from './dto/create-teacher.dto';
import { BulkCreateTeacherDto } from './dto/bulk-create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherFilterDto } from './dto/teacher-filter.dto';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';

@Injectable()
export class TeacherService {
    private readonly logger = new Logger(TeacherService.name);

    constructor(private readonly prisma: PrismaService) { }
 
    private safeDate(dateInput: any, fallback: Date = new Date()): Date {
        if (!dateInput) return fallback;
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? fallback : d;
    }

    async validateBulk(schoolId: number, dto: BulkCreateTeacherDto) {
        const MAX_BATCH = 300;
        if (dto.teachers.length > MAX_BATCH) {
            throw new BadRequestException(`Cannot validate more than ${MAX_BATCH} teachers at once. Split your file into smaller batches.`);
        }

        // Build intra-batch duplicate maps before hitting the DB
        const batchEmails = new Map<string, number>(); // email -> first occurrence index
        const batchEmpCodes = new Map<string, number>(); // empCode -> first occurrence index
        for (let i = 0; i < dto.teachers.length; i++) {
            const email = dto.teachers[i].email?.toLowerCase().trim();
            if (email) {
                if (batchEmails.has(email)) {
                    // Mark this index as duplicate; the first occurrence stays clean
                } else {
                    batchEmails.set(email, i);
                }
            }
            if (dto.teachers[i].empCode) {
                const code = dto.teachers[i].empCode!.trim().toUpperCase();
                if (!batchEmpCodes.has(code)) batchEmpCodes.set(code, i);
            }
        }

        const details = await Promise.all(
            dto.teachers.map(async (t, i) => {
                const errors: string[] = [];
                let status: 'VALID' | 'INVALID' | 'EXISTS' = 'VALID';

                const email = t.email?.toLowerCase().trim();

                // Intra-batch duplicate email check
                if (email && batchEmails.get(email) !== i) {
                    status = 'INVALID';
                    errors.push(`Duplicate email in this file (first appears at row ${(batchEmails.get(email) ?? 0) + 1})`);
                }

                // Intra-batch duplicate empCode check
                if (t.empCode) {
                    const code = t.empCode.trim().toUpperCase();
                    if (batchEmpCodes.get(code) !== i) {
                        status = 'INVALID';
                        errors.push(`Duplicate employee code in this file (first appears at row ${(batchEmpCodes.get(code) ?? 0) + 1})`);
                    }
                }

                // Check email globally (only if not already INVALID)
                if (status !== 'INVALID' && email) {
                    const existingIdentity = await this.prisma.authIdentity.findFirst({
                        where: { type: 'EMAIL', value: email },
                        include: {
                            user: {
                                include: {
                                    userSchools: { where: { schoolId } }
                                }
                            }
                        }
                    });

                    if (existingIdentity) {
                        const isInSchool = existingIdentity.user.userSchools.length > 0;
                        status = 'EXISTS';
                        if (isInSchool) errors.push('Teacher already exists in this school');
                        else errors.push('Email already registered in another school (will be linked)');
                    }
                }

                // Check empCode uniqueness in school (only if not already flagged)
                if (status !== 'INVALID' && t.empCode) {
                    const code = t.empCode.trim().toUpperCase();
                    const existingCode = await this.prisma.teacherProfile.findFirst({
                        where: { schoolId, empCode: code }
                    });
                    if (existingCode) {
                        status = 'INVALID';
                        errors.push(`Employee code ${code} is already assigned to another teacher`);
                    }
                }

                return { index: i, status, errors, email: t.email, name: t.name };
            })
        );

        return {
            total: dto.teachers.length,
            valid: details.filter(d => d.status === 'VALID').length,
            invalid: details.filter(d => d.status === 'INVALID').length,
            alreadyExists: details.filter(d => d.status === 'EXISTS').length,
            details
        };
    }

    async checkEmail(schoolId: number, email: string) {
        const identity = await this.prisma.authIdentity.findFirst({
            where: { type: 'EMAIL', value: email.toLowerCase().trim() },
            include: {
                user: {
                    include: {
                        userSchools: {
                            where: { schoolId },
                            include: { roles: { include: { role: true } } }
                        }
                    }
                }
            }
        });

        if (!identity) {
            return { exists: false };
        }

        const isTeacherInSchool = identity.user.userSchools.some(us => 
            us.roles.some(r => r.role.name === 'TEACHER')
        );

        return {
            exists: true,
            userName: identity.user.name,
            isTeacherInSchool
        };
    }

    async create(schoolId: number, dto: CreateTeacherDto) {
        const normalizedEmail = dto.email.toLowerCase().trim();

        // 1. Check for duplicate email across the global system
        const existingIdentity = await this.prisma.authIdentity.findFirst({
            where: {
                type: 'EMAIL',
                value: normalizedEmail,
            },
            include: { 
                user: {
                   include: {
                       userSchools: { include: { roles: { include: { role: true } } } }
                   }
                } 
            }
        });

        // If identity exists, we will LINK it instead of rejecting
        const identityAlreadyExists = !!existingIdentity;
        let existingUserRoles: string[] = [];

        if (identityAlreadyExists) {
            this.logger.log(`Email ${normalizedEmail} already exists. Linking to existing user ${existingIdentity.userId}`);
             const mem = existingIdentity.user.userSchools.find(m => m.schoolId === schoolId);
             if (mem) {
                 existingUserRoles = mem.roles.map(r => r.role.name);
                 if (existingUserRoles.includes('TEACHER')) {
                      throw new BadRequestException(`User ${normalizedEmail} is already a teacher in this school`);
                 }
             }
        }

        // 2. Find OR CREATE Teacher Role
        let teacherRole = await this.prisma.role.findFirst({
            where: { name: 'TEACHER' },
        });

        if (!teacherRole) {
            this.logger.warn('System Role "TEACHER" not found. Auto-creating...');
            try {
                teacherRole = await this.prisma.role.create({
                    data: {
                        name: 'TEACHER',
                    },
                });
            } catch (e) {
                this.logger.error("Failed to create TEACHER role.", e);
                throw new InternalServerErrorException('System Role "TEACHER" missing and could not be created.');
            }
        }

        let defaultPassword = 'Teacher@123';
        if (dto.phone && dto.phone.length >= 4) {
            const dob = new Date(dto.dateOfBirth);
            const day = String(dob.getDate()).padStart(2, '0');
            const month = String(dob.getMonth() + 1).padStart(2, '0');
            const year = dob.getFullYear();
            const last4Digits = dto.phone.slice(-4);
            defaultPassword = `${day}${month}${year}@${last4Digits}`;
        }
        const hashedPassword = await argon2.hash(defaultPassword);

        // 3. Transaction
        try {
            return await this.prisma.$transaction(async (tx) => {
                // A. Find or Create Global User
                let user: any = identityAlreadyExists ? existingIdentity.user : null;

                if (!user) {
                    user = await tx.user.create({
                        data: {
                            name: dto.name,
                            isActive: true,
                            photo: dto.photo || null,
                        },
                    });
                }

                if (!user) {
                    throw new InternalServerErrorException('Failed to resolve user account.');
                }

                // B. Link to School via UserSchool
                const userSchool = await tx.userSchool.upsert({
                    where: {
                        userId_schoolId: {
                            userId: user.id,
                            schoolId,
                        }
                    },
                    create: {
                        userId: user.id,
                        schoolId,
                        primaryRoleId: teacherRole.id,
                        isActive: true,
                    },
                    update: {
                        // If they are already in the school (e.g. as parent), leave primaryRole alone or update it?
                        // Usually we don't forcefully overwrite primaryRoleId if they were already active as another role,
                        // but for now we'll ensure isActive is true.
                        isActive: true,
                    }
                });

                // C. Assign Role in multi-role junction
                await tx.userSchoolRole.upsert({
                    where: {
                        userSchoolId_roleId: {
                            userSchoolId: userSchool.id,
                            roleId: teacherRole.id,
                        }
                    },
                    create: {
                        userSchoolId: userSchool.id,
                        roleId: teacherRole.id,
                    },
                    update: {}
                });

                // C. Create AuthIdentity if missing
                if (!identityAlreadyExists) {
                    await tx.authIdentity.create({
                        data: {
                            userId: user.id,
                            type: 'EMAIL',
                            value: normalizedEmail,
                            secret: hashedPassword,
                            verified: true,
                        },
                    });
                }

                // C. Create TeacherProfile
                const teacherProfile = await tx.teacherProfile.create({
                    data: {
                        userId: user.id,
                        schoolId,
                        joinDate: this.safeDate(dto.joinDate),
                        empCode: dto.empCode?.trim().toUpperCase(),
                        employmentType: dto.employmentType || 'FULL_TIME',
                        department: dto.department,
                        preferredStages: dto.preferredStages,
                    },
                });

                // Link to Department if exists
                if (dto.department) {
                    const dept = await tx.department.findFirst({
                        where: { schoolId, name: { equals: dto.department, mode: 'insensitive' } }
                    });
                    if (dept) {
                        await tx.departmentMember.upsert({
                            where: { departmentId_userId: { departmentId: dept.id, userId: user.id } },
                            create: { departmentId: dept.id, userId: user.id, role: 'TEACHER' },
                            update: { role: 'TEACHER', isActive: true }
                        });
                    }
                }

                // D. Create Personal Info (mapping fields from DTO)
                await tx.teacherPersonalInfo.create({
                    data: {
                        staffId: teacherProfile.id,
                        fullName: dto.name,
                        email: normalizedEmail,
                        phone: dto.phone,
                        gender: dto.gender?.toUpperCase() || 'NOT_SPECIFIED',
                        dateOfBirth: this.safeDate(dto.dateOfBirth, new Date('1970-01-01')),
                        addressLine1: dto.addressLine1 || 'N/A',
                        addressLine2: dto.addressLine2,
                        city: dto.city || 'N/A',
                        state: dto.state || 'N/A',
                        country: dto.country || 'N/A',
                        postalCode: dto.postalCode || '000000',
                        alternatePhone: dto.alternatePhone || '0000000000',
                        emergencyContactName: dto.emergencyContactName || 'N/A',
                        emergencyContactPhone: dto.emergencyContactPhone || '0000000000',
                        emergencyRelation: dto.emergencyRelation,
                        nationalIdMasked: dto.nationalIdMasked,
                        taxIdMasked: dto.taxIdMasked,
                    },
                });

                // E. Create Qualifications
                const qualifications = dto.qualifications || [];

                // Add flat qualification if present
                if (dto.degree && dto.institution) {
                    qualifications.push({
                        degree: dto.degree,
                        institution: dto.institution,
                        specialization: dto.specialization,
                        yearOfPassing: dto.yearOfPassing ? Number(dto.yearOfPassing) : undefined,
                    });
                }

                if (qualifications.length > 0) {
                    await tx.teacherQualification.createMany({
                        data: qualifications.map(q => ({
                            staffId: teacherProfile.id,
                            degree: q.degree,
                            institution: q.institution,
                            specialization: q.specialization,
                            yearOfPassing: q.yearOfPassing ? Number(q.yearOfPassing) : null,
                        })),
                    });
                }

                // F. Teacher Enhancements (Skills, Roles, etc.)
                if (dto.preferredSubjectIds && dto.preferredSubjectIds.length > 0) {
                    await tx.teacherPreferredSubject.createMany({
                        data: dto.preferredSubjectIds.map(subId => ({
                            teacherId: teacherProfile.id,
                            subjectId: subId,
                        })),
                    });
                }

                if (dto.documents && dto.documents.length > 0) {
                    await tx.teacherDocument.createMany({
                        data: dto.documents.map(doc => ({
                            staffId: teacherProfile.id,
                            type: doc.type,
                            ref: doc.ref,
                        })),
                    });
                }

                if (dto.skills && dto.skills.length > 0) {
                    await tx.teacherSkill.createMany({
                        data: dto.skills.map(skill => ({
                            teacherId: teacherProfile.id,
                            name: skill,
                        })),
                    });
                }

                if (dto.certifications && dto.certifications.length > 0) {
                    await tx.teacherCertification.createMany({
                        data: dto.certifications.map(c => ({
                            teacherId: teacherProfile.id,
                            name: c.name,
                            issuer: c.issuer,
                            year: c.year,
                            url: c.url,
                        })),
                    });
                }

                if (dto.trainings && dto.trainings.length > 0) {
                    await tx.teacherTraining.createMany({
                        data: dto.trainings.map(t => ({
                            teacherId: teacherProfile.id,
                            title: t.title,
                            organizer: t.organizer,
                            date: new Date(t.date),
                            durationHours: t.durationHours,
                            notes: t.notes,
                        })),
                    });
                }

                if (dto.additionalRoles && dto.additionalRoles.length > 0) {
                    await tx.teacherResponsibility.createMany({
                        data: dto.additionalRoles.map(r => ({
                            teacherId: teacherProfile.id,
                            roleName: r.roleName,
                        })),
                    });
                }

                if (dto.appraisals && dto.appraisals.length > 0) {
                    await tx.teacherAppraisal.createMany({
                        data: dto.appraisals.map(a => ({
                            teacherId: teacherProfile.id,
                            academicYearId: a.academicYearId,
                            kpiScore: a.kpiScore,
                            studentFeedbackScore: a.studentFeedbackScore,
                            principalNotes: a.principalNotes,
                        })),
                    });
                }

                return {
                    id: teacherProfile.id,
                    userId: user.id,
                    name: user.name,
                    email: normalizedEmail,
                    message: identityAlreadyExists
                        ? 'Teacher linked to existing user account successfully' 
                        : 'Teacher created successfully',
                    identityAlreadyExists,
                    emailVerified: true,
                    existingUserRoles,
                };
            });
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error('Error creating teacher', error);
            throw new InternalServerErrorException('Failed to create teacher');
        }
    }

    async bulkCreate(schoolId: number, dto: BulkCreateTeacherDto) {
        const MAX_BATCH = 300;
        if (dto.teachers.length > MAX_BATCH) {
            throw new BadRequestException(`Cannot import more than ${MAX_BATCH} teachers at once. Split your file into smaller batches.`);
        }

        const results: any[] = [];
        const errors: any[] = [];

        for (const teacherDto of dto.teachers) {
            try {
                const result = await this.create(schoolId, teacherDto);
                results.push(result);
            } catch (error) {
                // Handle NestJS validation errors which can have array messages
                const errorMessage = error.response?.message || error.message || 'Unknown Error';
                const readableError = Array.isArray(errorMessage) ? errorMessage.join(', ') : String(errorMessage);
                
                errors.push({
                    name: teacherDto.name || 'Unknown',
                    email: teacherDto.email || 'N/A',
                    error: readableError,
                });
            }
        }

        return {
            successCount: results.length,
            failureCount: errors.length,
            results,
            errors,
        };
    }

    async findAll(schoolId: number, query: TeacherFilterDto) {
        const { search, employmentType, gender, isActive, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;
        const where: any = { schoolId };

        if (isActive !== undefined && isActive !== 'all') {
            where.isActive = isActive === 'true';
        }

        if (employmentType) {
            where.employmentType = employmentType;
        }

        if (query.joinedThisMonth === 'true') {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            where.joinDate = {
                gte: startOfMonth
            };
        }

        if (query.department) {
            where.department = query.department;
        }

        if (query.startDate || query.endDate) {
            where.joinDate = {
                ...(where.joinDate || {}),
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            };
        }

        if (gender || search) {
            where.personalInfo = {
                ...(gender ? { gender } : {}),
                ...(search ? {
                    OR: [
                        { fullName: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                    ]
                } : {})
            };
        }

        const [teachers, total] = await Promise.all([
            this.prisma.teacherProfile.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            photo: true,
                            authIdentities: {
                                where: { type: 'EMAIL' },
                                select: { value: true },
                            },
                            departmentMemberships: {
                                include: { department: true }
                            }
                        },
                    },
                    personalInfo: true,
                    qualifications: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.teacherProfile.count({ where }),
        ]);

        return {
            data: (teachers as any[]).map((teacher) => ({
                ...teacher,
                user: {
                    ...teacher.user,
                    email: teacher.user.authIdentities?.[0]?.value || '',
                },
            })),
            total,
            page,
            limit,
        };
    }

    async getAnalytics(schoolId: number) {
        const now = new Date();
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const currentDay = days[now.getDay()];
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        // Get active academic year first
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
            select: { id: true }
        });

        const [
            totalTeachers,
            inactiveTeachers,
            allActiveTeachers,
            teachingNowEntries,
        ] = await Promise.all([
            this.prisma.teacherProfile.count({ where: { schoolId } }),
            this.prisma.teacherProfile.count({ where: { schoolId, isActive: false } }),
            this.prisma.teacherProfile.findMany({
                where: { schoolId, isActive: true },
                orderBy: { joinDate: 'desc' },
                take: 50, // Increased to support a more complete availability list
                include: {
                    user: { select: { name: true, photo: true } },
                    personalInfo: { select: { fullName: true, phone: true, email: true } }
                }
            }),
            activeYear ? this.prisma.timetableEntry.findMany({
                where: {
                    schoolId,
                    academicYearId: activeYear.id,
                    day: currentDay as any,
                    timeSlot: {
                        startTime: { lte: currentTime },
                        endTime: { gte: currentTime }
                    },
                    status: 'PUBLISHED'
                },
                select: {
                    teacherId: true,
                    group: { select: { name: true } },
                    subject: { select: { name: true } }
                }
            }) : Promise.resolve([])
        ]);

        const activeTeachers = totalTeachers - inactiveTeachers;

        const teachingMap = new Map();
        teachingNowEntries.forEach((e: any) => {
            if (e.teacherId && e.group && e.subject) {
                teachingMap.set(e.teacherId, {
                    currentClass: `${e.group.name} (${e.subject.name})`
                });
            }
        });

        const availabilityList = allActiveTeachers.map(t => {
            const teaching = teachingMap.get(t.id);
            return {
                id: t.id,
                name: t.user?.name || t.personalInfo?.fullName || 'Unknown',
                photo: t.user?.photo,
                status: teaching ? 'teaching' : 'free',
                currentClass: teaching?.currentClass,
            };
        });

        return {
            totalTeachers,
            activeTeachers,
            inactiveTeachers,
            presentToday: activeTeachers, // Integration with StaffAttendance still needed for accurate attendance
            onLeaveToday: 0,
            substitutionsNeeded: 0,
            classesWithoutTeachers: 0,
            pendingEvaluations: 0,
            pendingDisciplinaryCases: 0,
            upcomingRetirements: 0,
            contractExpirations: 0,
            recentlyJoinedCount: availabilityList.length,
            recentlyJoined: availabilityList, // This now doubles as the availability list
            trainingDeadlines: 0,
            certificatesExpiring: 0,
        };
    }

    async findOne(schoolId: number, id: number) {
        const staff = await this.prisma.teacherProfile.findFirst({
            where: {
                schoolId,
                id: id,
            },
            include: {
                user: {
                    include: {
                        authIdentities: { where: { type: 'EMAIL' } },
                        departmentMemberships: { include: { department: true } }
                    }
                },
                personalInfo: true,
                qualifications: true,
                preferredSubjects: { include: { subject: true } },
                skills: true,
                certifications: true,
                trainings: true,
                additionalRoles: true,
                appraisals: true,
                salaryConfigs: { where: { isActive: true }, take: 1 },
                payrolls: { orderBy: { generatedAt: 'desc' }, take: 12 },
                teacherBankAccounts: true,
                documents: true,
            },
        });

        if (!staff) throw new NotFoundException('Teacher not found');
        return staff;
    }

    async update(schoolId: number, id: number, dto: UpdateTeacherDto) {
        const staff: any = await this.findOne(schoolId, id);

        try {
            return await this.prisma.$transaction(async (tx) => {
                // Validate empCode uniqueness within school if it's being changed
                if (dto.empCode) {
                    const newCode = dto.empCode.trim().toUpperCase();
                    const codeConflict = await tx.teacherProfile.findFirst({
                        where: { schoolId, empCode: newCode, id: { not: staff.id } }
                    });
                    if (codeConflict) {
                        throw new BadRequestException(`Employee code ${newCode} is already assigned to another teacher.`);
                    }
                }

                // Update Base Profile
                await tx.teacherProfile.update({
                    where: { id: staff.id },
                    data: {
                        employmentType: dto.employmentType || undefined,
                        department: dto.department,
                        joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
                        empCode: dto.empCode?.trim().toUpperCase(),
                        preferredStages: dto.preferredStages,
                    },
                });

                // Link/Update Department Member
                if (dto.department) {
                    const dept = await tx.department.findFirst({
                        where: { schoolId, name: { equals: dto.department, mode: 'insensitive' } }
                    });
                    if (dept) {
                        await tx.departmentMember.upsert({
                            where: { departmentId_userId: { departmentId: dept.id, userId: staff.userId } },
                            create: { departmentId: dept.id, userId: staff.userId, role: 'TEACHER' },
                            update: { role: 'TEACHER', isActive: true }
                        });
                    }
                }

                // Update User Name if changed
                if (dto.name && dto.name !== staff.user.name) {
                    await tx.user.update({
                        where: { id: staff.userId },
                        data: { name: dto.name },
                    });
                }

                // Update Personal Info
                if (staff.personalInfo) {
                    await tx.teacherPersonalInfo.update({
                        where: { staffId: staff.id },
                        data: {
                            fullName: dto.name, // sync
                            phone: dto.phone,
                            email: dto.email,
                            gender: dto.gender?.toUpperCase(),
                            dateOfBirth: dto.dateOfBirth ? this.safeDate(dto.dateOfBirth) : undefined,
                            addressLine1: dto.addressLine1,
                            addressLine2: dto.addressLine2,
                            city: dto.city,
                            state: dto.state,
                            country: dto.country,
                            postalCode: dto.postalCode,
                            alternatePhone: dto.alternatePhone,
                            emergencyContactName: dto.emergencyContactName,
                            emergencyContactPhone: dto.emergencyContactPhone,
                            emergencyRelation: dto.emergencyRelation,
                            nationalIdMasked: dto.nationalIdMasked,
                            taxIdMasked: dto.taxIdMasked,
                        },
                    });
                } else {
                    // Create if missing (edge case)
                    await tx.teacherPersonalInfo.create({
                        data: {
                            staffId: staff.id,
                            fullName: dto.name || staff.user.name,
                            email: dto.email || '',
                            phone: dto.phone || '',
                            gender: dto.gender || '',
                            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : new Date(),
                            addressLine1: dto.addressLine1 || '',
                            city: dto.city || '',
                            state: dto.state || '',
                            country: dto.country || '',
                            postalCode: dto.postalCode || '',
                            alternatePhone: dto.alternatePhone || '',
                            emergencyContactName: dto.emergencyContactName || '',
                            emergencyContactPhone: dto.emergencyContactPhone || '',
                        },
                    });
                }

                // Note: Qualifications update is complex (add/remove/edit).
                // For simplified update, we might skip re-creating qualifications unless explicitly requested to replace.
                // Assuming "update" here just patches fields. Deep update of qualifications usually requires dedicated endpoint or simple replace logic.
                // Implementation: If qualifications provided, wipe and replace? Or just ignore?
                // User asked for "Edit". I'll replace if provided.
                if (dto.qualifications) {
                    await tx.teacherQualification.deleteMany({ where: { staffId: staff.id } });
                    if (dto.qualifications.length > 0) {
                        await tx.teacherQualification.createMany({
                            data: dto.qualifications.map(q => ({
                                staffId: staff.id,
                                degree: q.degree,
                                institution: q.institution,
                                specialization: q.specialization,
                                yearOfPassing: q.yearOfPassing ? Number(q.yearOfPassing) : null,
                            })),
                        });
                    }
                }

                // Update Preferred Subjects
                if (dto.preferredSubjectIds) {
                    await tx.teacherPreferredSubject.deleteMany({ where: { teacherId: staff.id } });
                    if (dto.preferredSubjectIds.length > 0) {
                        await tx.teacherPreferredSubject.createMany({
                            data: dto.preferredSubjectIds.map(subId => ({
                                teacherId: staff.id,
                                subjectId: subId,
                            })),
                        });
                    }
                }

                // Update Skills
                if (dto.skills) {
                    await tx.teacherSkill.deleteMany({ where: { teacherId: staff.id } });
                    if (dto.skills.length > 0) {
                        await tx.teacherSkill.createMany({
                            data: dto.skills.map(skill => ({
                                teacherId: staff.id,
                                name: skill,
                            })),
                        });
                    }
                }

                // Update Certifications
                if (dto.certifications) {
                    await tx.teacherCertification.deleteMany({ where: { teacherId: staff.id } });
                    if (dto.certifications.length > 0) {
                        await tx.teacherCertification.createMany({
                            data: dto.certifications.map(c => ({
                                teacherId: staff.id,
                                name: c.name,
                                issuer: c.issuer,
                                year: c.year,
                                url: c.url,
                            })),
                        });
                    }
                }

                // Update Trainings
                if (dto.trainings) {
                    await tx.teacherTraining.deleteMany({ where: { teacherId: staff.id } });
                    if (dto.trainings.length > 0) {
                        await tx.teacherTraining.createMany({
                            data: dto.trainings.map(t => ({
                                teacherId: staff.id,
                                title: t.title,
                                organizer: t.organizer,
                                date: new Date(t.date),
                                durationHours: t.durationHours,
                                notes: t.notes,
                            })),
                        });
                    }
                }

                // Update Additional Roles
                if (dto.additionalRoles) {
                    await tx.teacherResponsibility.deleteMany({ where: { teacherId: staff.id } });
                    if (dto.additionalRoles.length > 0) {
                        await tx.teacherResponsibility.createMany({
                            data: dto.additionalRoles.map(r => ({
                                teacherId: staff.id,
                                roleName: r.roleName,
                            })),
                        });
                    }
                }

                // Update Appraisals
                if (dto.appraisals) {
                    await tx.teacherAppraisal.deleteMany({ where: { teacherId: staff.id } });
                    if (dto.appraisals.length > 0) {
                        await tx.teacherAppraisal.createMany({
                            data: dto.appraisals.map(a => ({
                                teacherId: staff.id,
                                academicYearId: a.academicYearId,
                                kpiScore: a.kpiScore,
                                studentFeedbackScore: a.studentFeedbackScore,
                                principalNotes: a.principalNotes,
                            })),
                        });
                    }
                }

                if (dto.documents) {
                    await tx.teacherDocument.deleteMany({ where: { staffId: staff.id } });
                    if (dto.documents.length > 0) {
                        await tx.teacherDocument.createMany({
                            data: dto.documents.map(d => ({
                                staffId: staff.id,
                                type: d.type,
                                ref: d.ref,
                            })),
                        });
                    }
                }

                return { message: 'Teacher updated successfully' };
            });
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error('Error updating teacher', error);
            throw new InternalServerErrorException('Failed to update teacher');
        }
    }

    async remove(schoolId: number, id: number) {
        const staff: any = await this.findOne(schoolId, id);

        try {
            // Soft delete: Set isActive false on Profile and UserSchool membership
            await this.prisma.$transaction([
                this.prisma.teacherProfile.update({
                    where: { id: staff.id },
                    data: { isActive: false },
                }),
                this.prisma.userSchool.update({
                    where: {
                        userId_schoolId: {
                            userId: staff.userId,
                            schoolId,
                        }
                    },
                    data: { isActive: false },
                }),
            ]);
            return { message: 'Teacher deleted successfully' };
        } catch (error) {
            this.logger.error('Error deleting teacher', error);
            throw new InternalServerErrorException('Failed to delete teacher');
        }
    }

    // =================================================================
    // GRANULAR ENDPOINTS SUPPORT
    // =================================================================

    async getAllocationList(schoolId: number) {
        this.logger.log(`[School ${schoolId}] Fetching unified teacher allocation list`);

        // 1. Get Active Academic Year
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' },
            select: { id: true }
        });

        if (!activeYear) {
            throw new NotFoundException('No active academic year found for this school');
        }

        // 2. Fetch all active teachers with assignments and qualifications
        const teachers = await this.prisma.teacherProfile.findMany({
            where: {
                schoolId,
                isActive: true,
            },
            orderBy: {
                user: { name: 'asc' }
            },
            include: {
                user: {
                    select: {
                        name: true,
                        photo: true,
                    }
                },
                personalInfo: {
                    select: {
                        email: true,
                    }
                },
                qualifications: {
                    select: {
                        degree: true,
                        specialization: true,
                    }
                },
                preferredSubjects: {
                    include: {
                        subject: {
                            select: { name: true, code: true }
                        }
                    }
                },
                skills: {
                    select: { name: true }
                },
                subjectAssignments: {
                    where: { 
                        academicYearId: activeYear.id,
                        isActive: true 
                    },
                    select: { periodsPerWeek: true }
                }
            }
        });

        this.logger.log(`[School ${schoolId}] allocation-list: Found ${teachers.length} teachers in DB`);

        // 3. Format result to match frontend expectation
        const formatted = teachers.map(t => {
            const prefSubjects = t.preferredSubjects.map(ps => ps.subject.name).join(", ");
            const degrees = t.qualifications.map(q => q.degree).filter(Boolean).join(", ");
            const specs = t.qualifications.map(q => q.specialization).filter(Boolean).join(", ");
            const skills = t.skills.map((s: any) => s.name).join(", ");

            // Consistent specialization string: Subjects > Degrees > specialization > Skills
            const specialization = [prefSubjects, degrees, specs, skills].filter(Boolean).join(" | ") || "General Faculty";
            
            // Workload calculation (aggregate of periods assigned in current year)
            const workload = t.subjectAssignments.reduce((sum, a) => sum + (a.periodsPerWeek ?? 0), 0);

            return {
                id: t.id,
                name: t.user?.name || "Unknown",
                photo: t.user?.photo,
                email: t.personalInfo?.email || "No Email",
                specialization,
                stages: "", // Can be extended if needed
                workload
            };
        });

        return formatted;
    }

    async addDocument(schoolId: number, teacherId: number, dto: CreateDocumentDto) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherDocument.create({
            data: { staffId: teacherId, ...dto }
        });
    }

    async removeDocument(schoolId: number, teacherId: number, documentId: number) {
        await this.findOne(schoolId, teacherId);
        const doc = await this.prisma.teacherDocument.findFirst({ where: { id: documentId, staffId: teacherId } });
        if (!doc) throw new NotFoundException('Document not found');
        return this.prisma.teacherDocument.delete({ where: { id: documentId } });
    }

    async addQualification(schoolId: number, teacherId: number, dto: CreateQualificationDto) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherQualification.create({
            data: {
                staffId: teacherId,
                degree: dto.degree,
                institution: dto.institution,
                specialization: dto.specialization,
                yearOfPassing: dto.yearOfPassing ? Number(dto.yearOfPassing) : null,
            }
        });
    }

    async removeQualification(schoolId: number, teacherId: number, qualId: number) {
        await this.findOne(schoolId, teacherId);
        const qual = await this.prisma.teacherQualification.findFirst({ where: { id: qualId, staffId: teacherId } });
        if (!qual) throw new NotFoundException('Qualification not found');
        return this.prisma.teacherQualification.delete({ where: { id: qualId } });
    }

    async addSkill(schoolId: number, teacherId: number, skillName: string) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherSkill.create({
            data: { teacherId, name: skillName }
        });
    }

    async removeSkill(schoolId: number, teacherId: number, skillId: number) {
        await this.findOne(schoolId, teacherId);
        const skill = await this.prisma.teacherSkill.findFirst({ where: { id: skillId, teacherId } });
        if (!skill) throw new NotFoundException('Skill not found');
        return this.prisma.teacherSkill.delete({ where: { id: skillId } });
    }

    async addCertification(schoolId: number, teacherId: number, dto: CreateCertificationDto) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherCertification.create({
            data: { teacherId, ...dto }
        });
    }

    async removeCertification(schoolId: number, teacherId: number, certId: number) {
        await this.findOne(schoolId, teacherId);
        const cert = await this.prisma.teacherCertification.findFirst({ where: { id: certId, teacherId } });
        if (!cert) throw new NotFoundException('Certification not found');
        return this.prisma.teacherCertification.delete({ where: { id: certId } });
    }

    async addTraining(schoolId: number, teacherId: number, dto: CreateTrainingDto) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherTraining.create({
            data: {
                teacherId,
                title: dto.title,
                organizer: dto.organizer,
                date: new Date(dto.date),
                durationHours: dto.durationHours,
                notes: dto.notes
            }
        });
    }

    async removeTraining(schoolId: number, teacherId: number, trainingId: number) {
        await this.findOne(schoolId, teacherId);
        const training = await this.prisma.teacherTraining.findFirst({ where: { id: trainingId, teacherId } });
        if (!training) throw new NotFoundException('Training not found');
        return this.prisma.teacherTraining.delete({ where: { id: trainingId } });
    }

    async addAppraisal(schoolId: number, teacherId: number, dto: CreateAppraisalDto) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherAppraisal.create({
            data: { teacherId, ...dto }
        });
    }

    async removeAppraisal(schoolId: number, teacherId: number, appraisalId: number) {
        await this.findOne(schoolId, teacherId);
        const appraisal = await this.prisma.teacherAppraisal.findFirst({ where: { id: appraisalId, teacherId } });
        if (!appraisal) throw new NotFoundException('Appraisal not found');
        return this.prisma.teacherAppraisal.delete({ where: { id: appraisalId } });
    }

    async addResponsibility(schoolId: number, teacherId: number, dto: CreateResponsibilityDto) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherResponsibility.create({
            data: { teacherId, ...dto }
        });
    }

    async removeResponsibility(schoolId: number, teacherId: number, respId: number) {
        await this.findOne(schoolId, teacherId);
        const resp = await this.prisma.teacherResponsibility.findFirst({ where: { id: respId, teacherId } });
        if (!resp) throw new NotFoundException('Role not found');
        return this.prisma.teacherResponsibility.delete({ where: { id: respId } });
    }

    async addPreferredSubject(schoolId: number, teacherId: number, subjectId: number) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherPreferredSubject.create({
            data: { teacherId, subjectId }
        });
    }

    async removePreferredSubject(schoolId: number, teacherId: number, subjectId: number) {
        await this.findOne(schoolId, teacherId);
        return this.prisma.teacherPreferredSubject.delete({
            where: {
                teacherId_subjectId: { teacherId, subjectId }
            }
        });
    }

    async getPayrollInfo(schoolId: number, teacherId: number) {
        await this.findOne(schoolId, teacherId);
        const [salaryConfig, payrollHistory] = await Promise.all([
            this.prisma.salaryConfig.findFirst({
                where: { teacherId, schoolId, isActive: true }
            }),
            this.prisma.payroll.findMany({
                where: { teacherId, schoolId },
                orderBy: { generatedAt: 'desc' },
                take: 12
            })
        ]);
        return { salaryConfig, payrollHistory };
    }

    async upsertSalaryConfig(schoolId: number, teacherId: number, dto: UpsertSalaryConfigDto) {
        await this.findOne(schoolId, teacherId);

        // Deactivate existing
        await this.prisma.salaryConfig.updateMany({
            where: { teacherId, schoolId, isActive: true },
            data: { isActive: false }
        });

        // Create new
        return this.prisma.salaryConfig.create({
            data: {
                teacherId,
                schoolId,
                basicSalary: dto.basicSalary,
                allowance: dto.allowance || 0,
                deduction: dto.deduction || 0,
                effectiveFrom: new Date(),
                isActive: true
            }
        });
    }

    async upsertBankAccount(schoolId: number, teacherId: number, dto: UpsertBankAccountDto) {
        await this.findOne(schoolId, teacherId);

        if (dto.id) {
            // Verify ownership before updating — prevents IDOR
            const owned = await this.prisma.teacherBankAccount.findFirst({
                where: { id: dto.id, teacherId }
            });
            if (!owned) throw new NotFoundException('Bank account not found for this teacher');
            return this.prisma.teacherBankAccount.update({
                where: { id: dto.id },
                data: {
                    accountHolderName: dto.accountHolderName,
                    bankName: dto.bankName,
                    accountNumber: dto.accountNumber,
                    ifscCode: dto.ifscCode
                }
            });
        }

        // Try to find existing bank account to update if id not provided but one exists for teacher
        const existing = await this.prisma.teacherBankAccount.findFirst({ where: { teacherId } });
        if (existing) {
            return this.prisma.teacherBankAccount.update({
                where: { id: existing.id },
                data: {
                    accountHolderName: dto.accountHolderName,
                    bankName: dto.bankName,
                    accountNumber: dto.accountNumber,
                    ifscCode: dto.ifscCode
                }
            });
        }

        return this.prisma.teacherBankAccount.create({
            data: {
                teacherId,
                accountHolderName: dto.accountHolderName,
                bankName: dto.bankName,
                accountNumber: dto.accountNumber,
                ifscCode: dto.ifscCode
            }
        });
    }
}
