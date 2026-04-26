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
import { Prisma, Religion, BloodGroup, Caste, StudentCategory, AuditAction } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { AuditLogEvent } from '../../common/audit/audit.event';
import { S3StorageService } from '../../common/file-upload/s3-storage.service';
import { StudentBulkActionDto, StudentBulkActionType } from './dto/bulk-action.dto';
import { BulkStudentUploadDto } from './dto/bulk-upload-student.dto';
import { GuardianRelation } from './dto/create-student.dto';

@Injectable()
export class StudentService {
    private readonly logger = new Logger(StudentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditLog: AuditLogService,
        private readonly storageService: S3StorageService
    ) { }

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
        requestedById: number // Explicitly pass the user ID for logging
    ) {
        this.logger.log(`Creating student for school ${schoolId}, year ${academicYearId}: ${dto.fullName}`);

        // Normalize identifiers at the service boundary — uppercase trim so ADM001 and adm001 are always the same key
        const normalizedAdmissionNo = dto.admissionNo.toString().toUpperCase().trim();
        const normalizedRollNo = dto.rollNo ? dto.rollNo.toString().trim() : undefined;
        dto.admissionNo = normalizedAdmissionNo;
        if (normalizedRollNo !== undefined) dto.rollNo = normalizedRollNo;

        // 1. Check for duplicate Admission No across ALL years — admissionNo is a permanent school-level identifier
        const existingStudent = await this.prisma.studentProfile.findFirst({
            where: { schoolId, admissionNo: { equals: normalizedAdmissionNo, mode: 'insensitive' } },
        });
        if (existingStudent) {
            throw new BadRequestException(`Student with Admission No ${normalizedAdmissionNo} already exists for this academic year.`);
        }

        // 1b. Check roll number uniqueness per section (not globally)
        if (normalizedRollNo && dto.sectionId) {
            const existingRollNo = await this.prisma.studentProfile.findFirst({
                where: { sectionId: dto.sectionId, academicYearId, rollNo: normalizedRollNo },
            });
            if (existingRollNo) {
                throw new BadRequestException(`Roll No ${normalizedRollNo} is already assigned to another student in this section.`);
            }
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

        const section = await this.prisma.section.findFirst({ where: { id: dto.sectionId, schoolId } });
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
        const firstName = dto.fullName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const studentUsername = `${firstName}${dto.admissionNo.toLowerCase().trim()}`;
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

                // (Note: Phone query removed as parent auth is email-only)

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
                        try {
                            await tx.authIdentity.create({
                                data: {
                                    userId: familyUserId!,
                                    type: 'EMAIL',
                                    value: normalizedPrimaryEmail,
                                    verified: true,
                                    schoolId: schoolId // Link it to current school if possible
                                }
                            });
                        } catch (err) {
                            // If it already exists despite the lookup (race condition or different school context), 
                            // we ignore it as long as the user is linked correctly.
                            this.logger.warn(`AuthIdentity for ${normalizedPrimaryEmail} already exists, skipping creation.`);
                        }
                    }

                    // (Note: Phone identity creation removed as parent auth is email-only)
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

            // 6. Audit Log
            await this.auditLog.createLog(new AuditLogEvent(
                schoolId, requestedById, 'Student', 'CREATE', result.studentId, 
                { fullName: dto.fullName, admissionNo: dto.admissionNo }
            ));

            return result;
        } catch (error) {
            this.logger.error(`Failed to create student in school ${schoolId}`, error.stack);
            throw error;
        }
    }

    async validateBulk(
        schoolId: number,
        academicYearId: number,
        dto: BulkStudentUploadDto
    ) {
        const MAX_BATCH = 500;
        if (dto.students.length > MAX_BATCH) {
            throw new BadRequestException(`Cannot validate more than ${MAX_BATCH} students at once. Split your file into smaller batches.`);
        }

        this.logger.log(`Validating ${dto.students.length} students for school ${schoolId}, year ${academicYearId}`);

        const results = {
            total: dto.students.length,
            valid: 0,
            invalid: 0,
            alreadyExists: 0,
            details: [] as {
                index: number;
                admissionNo: string;
                status: 'VALID' | 'INVALID' | 'EXISTS';
                errors: string[];
                conflictField?: string;
                isInactive?: boolean;
                fullName?: string;
            }[],
        };

        // Two separate fetches:
        // - allSchoolStudents: no year filter — admissionNo is unique per school across all years
        // - currentYearStudents: year-scoped — rollNo uniqueness and clone detection are per academic year
        const [allSchoolStudents, currentYearStudents, validClasses, validSections] = await Promise.all([
            this.prisma.studentProfile.findMany({
                where: { schoolId },
                select: { admissionNo: true, isActive: true },
            }),
            this.prisma.studentProfile.findMany({
                where: { schoolId, academicYearId },
                include: { parents: { include: { parent: true } } },
            }),
            this.prisma.class.findMany({ where: { schoolId }, select: { id: true } }),
            this.prisma.section.findMany({ where: { schoolId }, select: { id: true } }),
        ]);

        const validClassIds = new Set(validClasses.map(c => c.id));
        const validSectionIds = new Set(validSections.map(s => s.id));

        // admissionNo map spans ALL years — same number can never be reused in the school
        const existingAdmissionNos = new Map(allSchoolStudents.map(s => [s.admissionNo.toUpperCase().trim(), s]));

        // rollNo map is current-year only — roll numbers reset each year per section
        const existingDbRollNosBySectionId = new Map<number, Set<string>>();
        for (const s of currentYearStudents) {
            if (s.rollNo && s.sectionId) {
                if (!existingDbRollNosBySectionId.has(s.sectionId)) {
                    existingDbRollNosBySectionId.set(s.sectionId, new Set());
                }
                existingDbRollNosBySectionId.get(s.sectionId)!.add(s.rollNo.trim());
            }
        }

        const batchAdmissionNos = new Set<string>();
        const batchSectionRollNos = new Map<number, Set<string>>(); // SectionID -> Set of RollNos

        for (let i = 0; i < dto.students.length; i++) {
            const item = dto.students[i];
            const errors: string[] = [];
            let status: 'VALID' | 'INVALID' | 'EXISTS' = 'VALID';
            let conflictField: string | undefined;
            let isInactive = false;

            const admNo = item.admissionNo?.toString().toUpperCase().trim();
            const rollNo = item.rollNo?.toString().trim();

            // 1. Check for duplicate Admission No in system
            const existing = admNo ? existingAdmissionNos.get(admNo) : null;
            if (existing) {
                status = 'EXISTS';
                conflictField = 'admissionNo';
                isInactive = !existing.isActive;
                if (isInactive) {
                    errors.push(`Student with Admission No ${item.admissionNo} exists but is marked as INACTIVE/LEFT.`);
                } else {
                    errors.push(`Admission No ${item.admissionNo} already exists in the system.`);
                }
            }

            // 2. Intra-file Admission No check
            if (admNo && batchAdmissionNos.has(admNo)) {
                status = 'INVALID';
                conflictField = 'admissionNo';
                errors.push(`Duplicate Admission No ${item.admissionNo} found within this file.`);
            }
            if (admNo) batchAdmissionNos.add(admNo);

            // 3. Intra-file Roll No check (scoping to section)
            if (rollNo && item.sectionId) {
                if (!batchSectionRollNos.has(item.sectionId)) batchSectionRollNos.set(item.sectionId, new Set());
                const sectionRolls = batchSectionRollNos.get(item.sectionId)!;
                if (sectionRolls.has(rollNo)) {
                    status = 'INVALID';
                    conflictField = 'rollNo';
                    errors.push(`Duplicate Roll No ${rollNo} for the same section found in this file.`);
                }
                sectionRolls.add(rollNo);
            }

            // 3b. DB check: rollNo already taken in this section (only relevant for new creates)
            if (rollNo && item.sectionId && status === 'VALID') {
                const dbSectionRolls = existingDbRollNosBySectionId.get(item.sectionId);
                if (dbSectionRolls?.has(rollNo)) {
                    status = 'INVALID';
                    conflictField = 'rollNo';
                    errors.push(`Roll No ${rollNo} is already assigned to another student in this section.`);
                }
            }

            // 4. Name + DOB + Father check (identifying clones with different Admission Nos, current year only)
            if (item.fullName && item.dob && item.fatherPhone && !existing) {
                const itemDobStr = new Date(item.dob).toDateString();
                const potentialClone = currentYearStudents.find(s =>
                    s.fullName.toLowerCase() === item.fullName.toLowerCase() &&
                    s.dob?.toDateString() === itemDobStr &&
                    s.parents.some(p => p.parent.fatherContact?.includes(item.fatherPhone!))
                );
                
                if (potentialClone) {
                    status = 'EXISTS';
                    conflictField = 'fullName';
                    isInactive = !potentialClone.isActive;
                    if (isInactive) {
                        errors.push(`Clone found: ${potentialClone.fullName} (INACTIVE, Adm No: ${potentialClone.admissionNo}).`);
                    } else {
                        errors.push(`A student with same name, DOB, and father's phone already exists (Adm No: ${potentialClone.admissionNo}).`);
                    }
                }
            }

        // 5. Format / Mandatory checks (always run, only block if status is still VALID or EXISTS_INACTIVE)
            if (!item.fullName) errors.push('Full Name is required.');
            if (!item.admissionNo) errors.push('Admission No is required.');
            if (!item.dob) errors.push('Date of Birth is required.');
            if (!item.gender) errors.push('Gender is required.');
            if (!item.classId) errors.push('Class is required.');
            else if (!validClassIds.has(item.classId)) errors.push(`Class ID ${item.classId} does not belong to this school.`);
            if (!item.sectionId) errors.push('Section is required.');
            else if (!validSectionIds.has(item.sectionId)) errors.push(`Section ID ${item.sectionId} does not belong to this school.`);
            if (!item.primaryEmail) errors.push('Primary Email is required.');

            // 6. Date logic checks
            if (item.dob) {
                const dob = new Date(item.dob);
                const today = new Date();
                if (isNaN(dob.getTime())) {
                    errors.push('Invalid DOB format. Use YYYY-MM-DD.');
                } else {
                    let age = today.getFullYear() - dob.getFullYear();
                    const m = today.getMonth() - dob.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
                    
                    if (age < 2 || age > 25) errors.push('Student age must be between 2 and 25 years.');
                    if (dob > today) errors.push('DOB cannot be in the future.');

                    if (item.admissionDate) {
                        const admissionDate = new Date(item.admissionDate);
                        if (!isNaN(admissionDate.getTime())) {
                            if (admissionDate < dob) errors.push('Admission date cannot be before DOB.');
                        }
                    }
                }
            }

            // 7. Final status resolution (errors override previous status when NOT a reactivatable case)
            const hasErrors = errors.length > 0;
            if (status === 'EXISTS' && isInactive) {
                // Special case: student exists but is left/inactive — can be reactivated
                // Only flag as INVALID if there are also actual format errors beyond the existence check
                const nonExistenceErrors = errors.filter(e => !e.includes('exists') && !e.includes('INACTIVE') && !e.includes('Clone'));
                if (nonExistenceErrors.length > 0) {
                    status = 'INVALID';
                }
            } else if (status === 'EXISTS' && !isInactive) {
                // Student is active in system — this is always a blocker, keep status=EXISTS
            } else if (hasErrors) {
                status = 'INVALID';
            }

            if (status === 'VALID') results.valid++;
            else if (status === 'EXISTS') results.alreadyExists++;
            else results.invalid++;

            results.details.push({
                index: i,
                admissionNo: item.admissionNo,
                fullName: item.fullName,
                status,
                errors,
                conflictField,
                isInactive
            });
        }

        return results;
    }

    async bulkUpload(
        schoolId: number,
        academicYearId: number,
        dto: BulkStudentUploadDto,
        requestedById: number
    ) {
        const MAX_BATCH = 500;
        if (dto.students.length > MAX_BATCH) {
            throw new BadRequestException(`Cannot upload more than ${MAX_BATCH} students at once. Split your file into smaller batches.`);
        }

        this.logger.log(`Bulk uploading ${dto.students.length} students for school ${schoolId}, year ${academicYearId}`);

        // Pre-fetch valid class/section IDs for ownership validation
        const [validClasses, validSections] = await Promise.all([
            this.prisma.class.findMany({ where: { schoolId }, select: { id: true } }),
            this.prisma.section.findMany({ where: { schoolId }, select: { id: true } }),
        ]);
        const validClassIds = new Set(validClasses.map(c => c.id));
        const validSectionIds = new Set(validSections.map(s => s.id));

        const results = {
            total: dto.students.length,
            success: 0,
            failed: 0,
            errors: [] as { index: number; admissionNo: string; error: string }[],
        };

        for (let i = 0; i < dto.students.length; i++) {
            const item = dto.students[i];
            try {
                // Ownership guard: reject rows with class/section from another school
                if (item.classId && !validClassIds.has(item.classId)) {
                    throw new BadRequestException(`Class ID ${item.classId} does not belong to this school`);
                }
                if (item.sectionId && !validSectionIds.has(item.sectionId)) {
                    throw new BadRequestException(`Section ID ${item.sectionId} does not belong to this school`);
                }

                // Normalize identifiers here so shouldActivate lookup + createDto are consistent
                const normalizedAdmNo = item.admissionNo?.toString().toUpperCase().trim();
                const normalizedRollNo = item.rollNo?.toString().trim() || undefined;

                // Transform bulk item to CreateStudentDto
                const createDto: CreateStudentDto = {
                    fullName: item.fullName,
                    admissionNo: normalizedAdmNo,
                    rollNo: normalizedRollNo,
                    dob: item.dob,
                    admissionDate: item.admissionDate,
                    classId: item.classId,
                    sectionId: item.sectionId,
                    personalInfo: {
                        gender: item.gender,
                        bloodGroup: item.bloodGroup,
                        religion: item.religion,
                        caste: item.caste,
                        category: item.category,
                        studentEmail: item.studentEmail,
                        nationality: item.nationality || 'Indian',
                        currentAddress: item.residentialAddress,
                        permanentAddress: item.residentialAddress,
                        city: item.city || 'N/A',
                        state: item.state || 'N/A',
                        pincode: item.pincode || '000000',
                    },
                    guardians: [
                        ...(item.fatherName || item.fatherPhone ? [{
                            name: item.fatherName || 'Father',
                            phone: item.fatherPhone,
                            relation: GuardianRelation.FATHER,
                            occupation: item.fatherOccupation,
                        }] : []),
                        ...(item.motherName || item.motherPhone ? [{
                            name: item.motherName || 'Mother',
                            phone: item.motherPhone,
                            relation: GuardianRelation.MOTHER,
                            occupation: item.motherOccupation,
                        }] : []),
                    ],
                    primaryEmail: item.primaryEmail,
                };

                if (item.shouldActivate) {
                    // Guard: only reactivate if student is actually inactive
                    const existingForActivation = await this.prisma.studentProfile.findFirst({
                        where: { schoolId, academicYearId, admissionNo: { equals: normalizedAdmNo, mode: 'insensitive' } }
                    });
                    if (!existingForActivation) {
                        throw new BadRequestException(`Student ${normalizedAdmNo} not found for reactivation`);
                    }
                    if (existingForActivation.isActive) {
                        // Skip silently — student is already active, no action needed
                        results.success++;
                        continue;
                    }
                    // Update existing student: mark active and update details
                    await this.prisma.studentProfile.update({
                        where: { id: existingForActivation.id },
                        data: {
                            isActive: true,
                            leftDate: null,
                            leavingReason: null,
                            fullName: item.fullName,
                            rollNo: normalizedRollNo,
                            dob: item.dob ? new Date(item.dob) : undefined,
                            classId: item.classId,
                            sectionId: item.sectionId,
                            personalInfo: {
                                upsert: {
                                    create: {
                                        gender: item.gender,
                                        city: item.city,
                                        state: item.state,
                                        pincode: item.pincode,
                                    },
                                    update: {
                                        gender: item.gender,
                                        city: item.city,
                                        state: item.state,
                                        pincode: item.pincode,
                                    }
                                }
                            }
                        }
                    });
                } else {
                    await this.create(schoolId, academicYearId, createDto, requestedById);
                }
                results.success++;
            } catch (error: any) {
                this.logger.error(`Bulk upload item ${i} failed: ${item.admissionNo}`, error.stack);
                results.failed++;
                results.errors.push({
                    index: i,
                    admissionNo: item.admissionNo,
                    error: error.message || 'Unknown error',
                });
            }
        }

        // Audit log for bulk upload
        await this.auditLog.createLog(new AuditLogEvent(
            schoolId, requestedById, 'Student', 'BULK_CREATE' as any, undefined, 
            { total: results.total, success: results.success, failed: results.failed }
        ));

        return results;
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
        const student = await this.prisma.studentProfile.findFirst({
            where: { id, schoolId },
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
            this.logger.warn(`Student not found: ID ${id}, school ${schoolId}`);
            throw new NotFoundException('Student not found');
        }

        return student;
    }

    async update(id: number, schoolId: number, dto: UpdateStudentDto, requestedById: number) {
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

            // Audit Log
            await this.auditLog.createLog(new AuditLogEvent(
                schoolId, requestedById, 'Student', 'UPDATE', id, 
                { fullName: dto.fullName, admissionNo: dto.admissionNo }
            ));

            return updated;
        } catch (error) {
            this.logger.error(`Failed to update student ${id}`, error.stack);
            throw error;
        }
    }

    async remove(id: number, schoolId: number, requestedById: number) {
        this.logger.log(`Performing full cascading removal for student ${id} in school ${schoolId}`);

        // 1. Fetch student with parents and user info for identifying what else to delete
        const student = await this.prisma.studentProfile.findFirst({
            where: { id, schoolId },
            include: {
                parents: {
                    include: {
                        parent: true
                    }
                }
            }
        });

        if (!student) {
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

            // Audit Log
            await this.auditLog.createLog(new AuditLogEvent(
                schoolId, requestedById, 'Student', 'DELETE', id, 
                { fullName: student.fullName, admissionNo: student.admissionNo }
            ));

            return { message: 'Student and associated records fully removed from system' };
        } catch (error) {
            this.logger.error(`Failed to remove student ${id} records`, error.stack);
            throw new BadRequestException('Failed to remove student records: ' + (error.message || 'Unknown error'));
        }
    }

    // ---------------------------------------------------
    // ANALYTICS
    // ---------------------------------------------------
    async markAsLeft(schoolId: number, id: number, dto: MarkStudentLeftDto, requestedById: number) {
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

                // 3. Deactivate Parent Membership ONLY if they have no other active students at this school
                if (student.parents && student.parents.length > 0) {
                    for (const parentStudent of student.parents) {
                        const parentProfile = parentStudent.parent;
                        if (parentProfile && parentProfile.userId) {
                            // BUG FIX: Check if this parent has other active children at this specific school
                            const otherActiveChildren = await tx.studentProfile.count({
                                where: {
                                    schoolId,
                                    id: { not: student.id },
                                    isActive: true,
                                    parents: { some: { parentId: parentProfile.id } }
                                }
                            });

                            if (otherActiveChildren === 0) {
                                // Safe to deactivate — no other active children at this school
                                await tx.userSchool.updateMany({
                                    where: {
                                        userId: parentProfile.userId,
                                        schoolId,
                                    },
                                    data: { isActive: false }
                                });
                            }
                        }
                    }
                }
            });

            this.logger.log(`Student ${id} marked as left successfully`);

            // Audit Log
            await this.auditLog.createLog(new AuditLogEvent(
                schoolId, requestedById, 'Student', 'UPDATE_STATUS', id, 
                { status: 'LEFT', reason: dto.reason, leftDate: leftDate }
            ));

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
            const month = curr.admissionDate.toLocaleString('en-US', { month: 'short' });
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

    async bulkActions(schoolId: number, dto: StudentBulkActionDto, requestedById: number) {
        this.logger.log(`Performing bulk action ${dto.action} for ${dto.studentIds.length} students in school ${schoolId}`);

        const result = await this.prisma.$transaction(async (tx) => {
            let affectedCount = 0;

            if (dto.action === StudentBulkActionType.DEACTIVATE) {
                const update = await tx.studentProfile.updateMany({
                    where: { id: { in: dto.studentIds }, schoolId },
                    data: { isActive: false },
                });
                affectedCount = update.count;
            } else if (dto.action === StudentBulkActionType.ACTIVATE) {
                const update = await tx.studentProfile.updateMany({
                    where: { id: { in: dto.studentIds }, schoolId },
                    data: { isActive: true },
                });
                affectedCount = update.count;
            } else if (dto.action === StudentBulkActionType.SET_HOUSE) {
                if (!dto.houseId) throw new BadRequestException('houseId is required for SET_HOUSE action');
                const update = await tx.studentProfile.updateMany({
                    where: { id: { in: dto.studentIds }, schoolId },
                    data: { houseId: dto.houseId },
                });
                affectedCount = update.count;
            } else if (dto.action === StudentBulkActionType.PROMOTE) {
                if (!dto.targetClassId || !dto.targetSectionId) {
                    throw new BadRequestException('targetClassId and targetSectionId are required for PROMOTE action');
                }
                const update = await tx.studentProfile.updateMany({
                    where: { id: { in: dto.studentIds }, schoolId },
                    data: { classId: dto.targetClassId, sectionId: dto.targetSectionId },
                });
                affectedCount = update.count;
            }

            return { affectedCount };
        });

        // Audit Log
        await this.auditLog.createLog(new AuditLogEvent(
            schoolId, requestedById, 'Student', `BULK_${dto.action}`, undefined, 
            { studentCount: dto.studentIds.length, affectedCount: result.affectedCount, details: dto }
        ));

        return {
            message: `Bulk action ${dto.action} completed successfully`,
            ...result
        };
    }

    // ==========================
    // DOCUMENTS
    // ==========================
    
    async generateDocumentPresignedUrl(schoolId: number, studentId: number, fileName: string, fileType: string) {
        await this.findOne(studentId, schoolId);
        
        // Key format strictly as requested: tenantid/studentid/docs/
        const customKey = `${schoolId}/${studentId}/docs/${Date.now()}_${fileName.replace(/[^a-z0-9.-]/gi, '_').toLowerCase()}`;
        const presignedUrl = await this.storageService.getPresignedUrl(customKey, fileType, 3600);
        
        return { presignedUrl, customKey };
    }

    async saveDocument(schoolId: number, studentId: number, name: string, type: string, size: number, customKey: string, requestedById: number) {
        const student = await this.findOne(studentId, schoolId);
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${customKey}`;

        const document = await this.prisma.studentDocument.create({
            data: {
                studentId,
                name,
                type,
                size,
                url: publicUrl,
                isVerified: false,
            }
        });

        await this.auditLog.createLog(new AuditLogEvent(
            schoolId, requestedById, 'Student', 'UPDATE', studentId, 
            { action: 'DOCUMENT_UPLOAD', documentName: name }
        ));

        return document;
    }

    async deleteDocument(schoolId: number, studentId: number, docId: number, requestedById: number) {
        // BUG FIX: Verify school ownership FIRST to prevent cross-school document probing
        await this.findOne(studentId, schoolId);

        const document = await this.prisma.studentDocument.findUnique({
            where: { id: docId }
        });

        if (!document || document.studentId !== studentId) {
            throw new NotFoundException('Document not found');
        }

        const customKey = this.storageService.extractKeyFromUrl(document.url);
        if (customKey) {
            await this.storageService.deleteFile(customKey);
        }

        await this.prisma.studentDocument.delete({ where: { id: docId } });

        await this.auditLog.createLog(new AuditLogEvent(
            schoolId, requestedById, 'Student', 'UPDATE', studentId, 
            { action: 'DOCUMENT_DELETE', documentName: document.name }
        ));

        return { message: 'Document deleted successfully' };
    }
}
