import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
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
        return this.prisma.teacherProfile.findMany({
            where: { schoolId, isActive: true },
            include: {
                user: {
                    select: { id: true, name: true, photo: true },
                },
                personalInfo: true,
                qualifications: true,
                // Optional: Include assignments if needed
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        const staff = await this.prisma.teacherProfile.findFirst({
            where: {
                schoolId,
                OR: [
                    { id: id },
                    { userId: id },
                ],
            },
            include: {
                user: true,
                personalInfo: true,
                qualifications: true,
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
                                yearOfPassing: q.yearOfPassing,
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
}
