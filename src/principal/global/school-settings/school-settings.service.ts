import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';

import { AuditLogService } from '../../../common/audit/audit-log.service';
import { AuditLogEvent } from '../../../common/audit/audit.event';
import { S3StorageService } from '../../../common/file-upload/s3-storage.service';
import { MediaCleaner } from '../../../common/file-upload/media-cleaner.util';

@Injectable()
export class SchoolSettingsService {
    private readonly logger = new Logger(SchoolSettingsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditLogService: AuditLogService,
        private readonly s3Storage: S3StorageService,
    ) { }

    async getSettings(schoolId: number) {
        let settings = await this.prisma.schoolSettings.findUnique({
            where: { schoolId },
            include: {
                school: {
                    select: {
                        subdomain: true,
                        name: true
                    }
                }
            }
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
                    },
                    include: {
                        school: {
                            select: {
                                subdomain: true,
                                name: true
                            }
                        }
                    }
                });
            } catch (err) {
                // Handle race condition
                this.logger.warn(`Race condition or error creating settings for school ${schoolId}: ${err.message}`);
                settings = await this.prisma.schoolSettings.findUnique({ 
                    where: { schoolId },
                    include: {
                        school: {
                            select: {
                                subdomain: true,
                                name: true
                            }
                        }
                    }
                });           }
        }
        return settings;
    }

    async updateSettings(schoolId: number, userId: number, dto: UpdateSchoolSettingsDto, ip: string) {
        this.logger.log(`Updating settings for school ${schoolId} by user ${userId}`);

        try {
            // 1. Fetch current settings to check for media changes
            const currentSettings = await this.prisma.schoolSettings.findUnique({
                where: { schoolId },
                select: { logoUrl: true, backgroundImageUrl: true, faviconUrl: true }
            });

            // 2. Perform the update
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
                    isWebsitePublic: dto.isWebsitePublic ?? false,
                },
            });

            // 3. Media Cleanup Logic (only if update was successful)
            if (currentSettings) {
                // 3a. Flat fields cleanup
                const mediaFields = ['logoUrl', 'backgroundImageUrl', 'faviconUrl'] as const;
                
                for (const field of mediaFields) {
                    const oldUrl = currentSettings[field];
                    const newUrl = dto[field];

                    // If URL changed and old URL existed, try to delete the old file
                    if (oldUrl && newUrl !== undefined && newUrl !== oldUrl) {
                        const oldKey = this.s3Storage.extractKeyFromUrl(oldUrl);
                        if (oldKey) {
                            this.logger.log(`Cleaning up old media file: ${oldKey} (replaced ${field})`);
                            this.s3Storage.deleteFile(oldKey).catch(err => 
                                this.logger.warn(`Failed to cleanup old media file ${oldKey}: ${err.message}`)
                            );
                        }
                    }
                }

                // 3b. Deep JSON cleanup (landingPageConfig)
                if (dto.landingPageConfig !== undefined) {
                    const oldConfig = currentSettings['landingPageConfig'] || {};
                    const newConfig = dto.landingPageConfig || {};
                    
                    const keysToDelete = MediaCleaner.getKeysToDelete(oldConfig, newConfig, this.s3Storage);
                    
                    if (keysToDelete.length > 0) {
                        this.logger.log(`Cleaning up ${keysToDelete.length} files from CMS landingPageConfig`);
                        keysToDelete.forEach(key => {
                            this.s3Storage.deleteFile(key).catch(err => 
                                this.logger.warn(`Failed to cleanup CMS media file ${key}: ${err.message}`)
                            );
                        });
                    }
                }
            }

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
