import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';

import { AuditLogService } from '../../../common/audit/audit-log.service';
import { AuditLogEvent } from '../../../common/audit/audit.event';

@Injectable()
export class SchoolSettingsService {
    private readonly logger = new Logger(SchoolSettingsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditLogService: AuditLogService,
    ) { }

    async getSettings(schoolId: number) {
        let settings = await this.prisma.schoolSettings.findUnique({
            where: { schoolId },
        });

        if (!settings) {
            // Return defaults if not found, or optionally create default
            // Better UX: Create default settings if first access
            this.logger.log(`Settings not found for school ${schoolId}, initializing defaults.`);
            try {
                settings = await this.prisma.schoolSettings.create({
                    data: {
                        schoolId,
                        schoolStartTime: new Date(new Date().setHours(9, 0, 0, 0)),
                        schoolEndTime: new Date(new Date().setHours(15, 0, 0, 0)),
                        attendanceMode: 'DAILY', // Default
                    }
                });
            } catch (err) {
                // Handle race condition
                this.logger.warn(`Race condition or error creating settings for school ${schoolId}: ${err.message}`);
                settings = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
            }
        }
        return settings;
    }

    async updateSettings(schoolId: number, userId: number, dto: UpdateSchoolSettingsDto, ip: string) {
        this.logger.log(`Updating settings for school ${schoolId} by user ${userId}`);

        try {
            const result = await this.prisma.schoolSettings.upsert({
                where: { schoolId },
                update: {
                    ...dto,
                    schoolStartTime: dto.schoolStartTime ? new Date(dto.schoolStartTime) : undefined,
                    schoolEndTime: dto.schoolEndTime ? new Date(dto.schoolEndTime) : undefined,
                },
                create: {
                    schoolId,
                    // Branding
                    motto: dto.motto,
                    backgroundImageUrl: dto.backgroundImageUrl,
                    logoUrl: dto.logoUrl,
                    faviconUrl: dto.faviconUrl,

                    // Address
                    street: dto.street,
                    city: dto.city,
                    state: dto.state,
                    zipCode: dto.zipCode,
                    country: dto.country,

                    // Contact
                    phone: dto.phone,
                    email: dto.email,
                    website: dto.website,

                    // Academic
                    attendanceMode: dto.attendanceMode || 'DAILY',
                    gradingSystem: dto.gradingSystem,
                    promotionPolicy: dto.promotionPolicy,
                    maxPeriodsPerDay: dto.maxPeriodsPerDay,
                    minGapBetweenPeriods: dto.minGapBetweenPeriods,
                    flexiblePeriodDuration: dto.flexiblePeriodDuration,
                    defaultPeriodLength: dto.defaultPeriodLength,
                    lateMarkThreshold: dto.lateMarkThreshold,
                    absentAfter: dto.absentAfter,
                    allowExcuseSubmission: dto.allowExcuseSubmission,
                    maxSubjectsPerStudent: dto.maxSubjectsPerStudent,
                    maxRepeatPeriodsPerDay: dto.maxRepeatPeriodsPerDay,
                    maxConsecutiveSameSubject: dto.maxConsecutiveSameSubject,
                    // Dates must be provided if creating new
                    schoolStartTime: dto.schoolStartTime ? new Date(dto.schoolStartTime) : new Date(new Date().setHours(9, 0, 0, 0)),
                    schoolEndTime: dto.schoolEndTime ? new Date(dto.schoolEndTime) : new Date(new Date().setHours(15, 0, 0, 0)),
                },
            });

            // Log the action
            await this.auditLogService.createLog(new AuditLogEvent(
                schoolId,
                userId,
                'SchoolSettings',
                'UPDATE',
                result.id, // entityId
                JSON.stringify(dto), // newValue (simplified)
                ip // Real IP Address
            ));

            return result;
        } catch (error) {
            this.logger.error(`Failed to update settings for school ${schoolId}`, error.stack);
            throw error; // Rethrow to let global filter handle it
        }
    }
}
