import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as cacheManager from 'cache-manager';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';

import { AuditLogService } from '../../../common/audit/audit-log.service';
import { AuditLogEvent } from '../../../common/audit/audit.event';
import { S3StorageService } from '../../../common/file-upload/s3-storage.service';
import { MediaCleaner } from '../../../common/file-upload/media-cleaner.util';

@Injectable()
export class SchoolSettingsService {
    private readonly logger = new Logger(SchoolSettingsService.name);
    private readonly CACHE_TTL = 3600000; // 1 hour

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditLogService: AuditLogService,
        private readonly s3Storage: S3StorageService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: cacheManager.Cache,
    ) { }

    async getSchoolInfo(schoolId: number) {
        const cacheKey = `SCHOOL_INFO:${schoolId}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            select: { id: true, name: true, type: true, subdomain: true },
        });

        await this.cacheManager.set(cacheKey, school, this.CACHE_TTL * 24);
        return school;
    }

    /**
     * Cache Tagging Strategy:
     * High frequent reads for settings are cached.
     * Any update increments the version key for that school.
     */
    private async getVersionKey(schoolId: number): Promise<string> {
        const key = `SETTINGS_VER:${schoolId}`;
        let version = await this.cacheManager.get<number>(key);
        if (!version) {
            version = Date.now();
            await this.cacheManager.set(key, version, this.CACHE_TTL * 24);
        }
        return `V${version}`;
    }

    private async invalidateCache(schoolId: number) {
        this.logger.debug(`Invalidating settings cache for school ${schoolId}`);
        const versionKey = `SETTINGS_VER:${schoolId}`;
        await this.cacheManager.set(versionKey, Date.now(), this.CACHE_TTL * 24); // Instant invalidation
        await this.cacheManager.del(`SETTINGS_SINGLE:${schoolId}`);
        await this.cacheManager.del(`SCHOOL_INFO:${schoolId}`);
    }

    async getSettings(schoolId: number) {
        const ver = await this.getVersionKey(schoolId);
        const cacheKey = `SETTINGS_SINGLE:${schoolId}:${ver}`;
        
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

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
            this.logger.log(`Settings not found for school ${schoolId}, initializing defaults.`);
            try {
                settings = await this.prisma.schoolSettings.create({
                    data: {
                        schoolId,
                        schoolStartTime: new Date(new Date().setHours(9, 0, 0, 0)),
                        schoolEndTime: new Date(new Date().setHours(15, 0, 0, 0)),
                        attendanceMode: 'DAILY',
                    },
                    include: {
                        school: { select: { subdomain: true, name: true } }
                    }
                });
            } catch (err) {
                this.logger.warn(`Race condition creating settings for school ${schoolId}`);
                settings = await this.prisma.schoolSettings.findUnique({ 
                    where: { schoolId },
                    include: { school: { select: { subdomain: true, name: true } } }
                });
            }
        }

        await this.cacheManager.set(cacheKey, settings, this.CACHE_TTL);
        return settings;
    }

    async updateSettings(schoolId: number, userId: number, dto: UpdateSchoolSettingsDto, ip: string) {
        this.logger.log(`Updating settings for school ${schoolId} by user ${userId}`);

        try {
            // 1. Fetch current settings (including landingPageConfig for cleanup)
            const currentSettings = await this.prisma.schoolSettings.findUnique({
                where: { schoolId },
                select: { logoUrl: true, backgroundImageUrl: true, faviconUrl: true, landingPageConfig: true }
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
                    ...dto,
                    schoolStartTime: dto.schoolStartTime ? new Date(dto.schoolStartTime) : new Date(new Date().setHours(9, 0, 0, 0)),
                    schoolEndTime: dto.schoolEndTime ? new Date(dto.schoolEndTime) : new Date(new Date().setHours(15, 0, 0, 0)),
                    isWebsitePublic: dto.isWebsitePublic ?? false,
                },
            });

            // 3. Media Cleanup Logic
            if (currentSettings) {
                const mediaFields = ['logoUrl', 'backgroundImageUrl', 'faviconUrl'] as const;
                
                for (const field of mediaFields) {
                    const oldUrl = currentSettings[field];
                    const newUrl = dto[field];

                    if (oldUrl && newUrl !== undefined && newUrl !== oldUrl) {
                        const oldKey = this.s3Storage.extractKeyFromUrl(oldUrl as string);
                        if (oldKey) {
                            this.s3Storage.deleteFile(oldKey).catch(err => 
                                this.logger.warn(`Cleanup failed for ${field}: ${err.message}`)
                            );
                        }
                    }
                }

                if (dto.landingPageConfig !== undefined) {
                    const oldConfig = currentSettings.landingPageConfig || {};
                    const newConfig = dto.landingPageConfig || {};
                    const keysToDelete = MediaCleaner.getKeysToDelete(oldConfig, newConfig, this.s3Storage);
                    
                    if (keysToDelete.length > 0) {
                        keysToDelete.forEach(key => {
                            this.s3Storage.deleteFile(key).catch(err => 
                                this.logger.warn(`CMS Cleanup failed for ${key}: ${err.message}`)
                            );
                        });
                    }
                }
            }

            // 4. Invalidate Cache
            await this.invalidateCache(schoolId);

            // 5. Explicit Audit
            await this.auditLogService.createLog(new AuditLogEvent(
                schoolId,
                userId,
                'SchoolSettings',
                'UPDATE',
                result.id,
                JSON.stringify(dto),
                ip
            ));

            return result;
        } catch (error) {
            this.logger.error(`Update failed for school ${schoolId}`, error.stack);
            throw error;
        }
    }
}
