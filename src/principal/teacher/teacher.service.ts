import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
    CreateTeacherDto,
    CreateDocumentDto,
    CreateQualificationDto,
    CreateCertificationDto,
    CreateTrainingDto,
    CreateResponsibilityDto,
    CreateAppraisalDto
} from './dto/create-teacher.dto';
import { BulkCreateTeacherDto } from './dto/bulk-create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import * as argon2 from 'argon2';
import { Prisma } from 'src/generated/prisma';

@Injectable()
export class TeacherService {
    private readonly logger = new Logger(TeacherService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateTeacherDto) {
        // 1. Check for duplicate email
        const existingIdentity = await this.prisma.authIdentity.findFirst({
            where: {
                schoolId,
                type: 'EMAIL',
                value: dto.email,
            },
        });

        if (existingIdentity) {
            throw new BadRequestException(`Email ${dto.email} is already in use`);
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
                // A. Create User
                const user = await tx.user.create({
                    data: {
                        schoolId,
                        name: dto.name,
                        roleId: teacherRole.id,
                        isActive: true,
                        photo: dto.photo || null, // Map photo if available
                    },
                });

                // B. Create AuthIdentity
                await tx.authIdentity.create({
                    data: {
                        schoolId,
                        userId: user.id,
                        type: 'EMAIL',
                        value: dto.email,
                        secret: hashedPassword,
                        verified: true,
                    },
                });

                // C. Create TeacherProfile
                const teacherProfile = await tx.teacherProfile.create({
                    data: {
                        userId: user.id,
                        schoolId,
                        joinDate: dto.joinDate ? new Date(dto.joinDate) : new Date(),
                        empCode: dto.empCode,
                        preferredStages: dto.preferredStages,
                    },
                });

                // D. Create Personal Info (mapping fields from DTO)
                await tx.teacherPersonalInfo.create({
                    data: {
                        staffId: teacherProfile.id,
                        fullName: dto.name,
                        email: dto.email,
                        phone: dto.phone,
                        gender: dto.gender,
                        dateOfBirth: new Date(dto.dateOfBirth),
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
                    email: dto.email,
                    message: 'Teacher created successfully',
                };
            });
        } catch (error) {
            this.logger.error('Error creating teacher', error);
            throw new InternalServerErrorException('Failed to create teacher');
        }
    }

    async bulkCreate(schoolId: number, dto: BulkCreateTeacherDto) {
        const results: any[] = [];
        const errors: any[] = [];

        for (const teacherDto of dto.teachers) {
            try {
                const result = await this.create(schoolId, teacherDto);
                results.push(result);
            } catch (error) {
                errors.push({
                    email: teacherDto.email,
                    error: error.message,
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

    async findAll(schoolId: number) {
        const teachers = await this.prisma.teacherProfile.findMany({
            where: {
                schoolId,
                isActive: true,
                user: {
                    role: {
                        name: 'TEACHER',
                    },
                },
            },
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
                    },
                },
                personalInfo: true,
                qualifications: true,
                // Optional: Include assignments if needed
            },
            orderBy: { createdAt: 'desc' },
        });

        return teachers.map((teacher) => ({
            ...teacher,
            user: {
                ...teacher.user,
                email: teacher.user.authIdentities?.[0]?.value || '',
            },
        }));
    }

    async findOne(schoolId: number, id: number) {
        const staff = await this.prisma.teacherProfile.findFirst({
            where: {
                schoolId,
                id: id,
            },
            include: {
                user: true,
                personalInfo: true,
                qualifications: true,
                preferredSubjects: { include: { subject: true } },
                skills: true,
                certifications: true,
                trainings: true,
                additionalRoles: true,
                appraisals: true,
            },
        });

        if (!staff) throw new NotFoundException('Teacher not found');
        return staff;
    }

    async update(schoolId: number, id: number, dto: UpdateTeacherDto) {
        const staff: any = await this.findOne(schoolId, id);

        try {
            return await this.prisma.$transaction(async (tx) => {
                // Update Base Profile
                await tx.teacherProfile.update({
                    where: { id: staff.id },
                    data: {
                        joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
                        empCode: dto.empCode,
                        preferredStages: dto.preferredStages,
                    },
                });

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
                            gender: dto.gender,
                            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
                            addressLine1: dto.addressLine1,
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
            this.logger.error('Error updating teacher', error);
            throw new InternalServerErrorException('Failed to update teacher');
        }
    }

    async remove(schoolId: number, id: number) {
        const staff: any = await this.findOne(schoolId, id);

        try {
            // Soft delete: Set isActive false on Profile and User
            await this.prisma.$transaction([
                this.prisma.teacherProfile.update({
                    where: { id: staff.id },
                    data: { isActive: false },
                }),
                this.prisma.user.update({
                    where: { id: staff.userId },
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
}
