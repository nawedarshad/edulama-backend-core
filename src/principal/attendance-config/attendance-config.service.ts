import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateAttendanceConfigDto } from './dto/update-config.dto';

@Injectable()
export class AttendanceConfigService {
    constructor(private readonly prisma: PrismaService) { }

    async getConfig(schoolId: number, academicYearId: number) {
        const [config, schoolSettings] = await Promise.all([
            this.prisma.attendanceConfig.findUnique({
                where: {
                    schoolId_academicYearId: {
                        schoolId,
                        academicYearId
                    }
                },
                select: {
                    mode: true,
                    responsibility: true,
                }
            }),
            this.prisma.schoolSettings.findUnique({
                where: { schoolId },
                select: { trackingStrategy: true }
            })
        ]);

        // If no config exists for this AY, return defaults
        if (!config) {
            return {
                mode: 'DAILY',
                responsibility: 'CLASS_TEACHER',
                trackingStrategy: schoolSettings?.trackingStrategy || 'ONLY_ATTENDANCE',
                warning: 'Configuration not found for this academic year, returning defaults.'
            };
        }

        return {
            ...config,
            trackingStrategy: schoolSettings?.trackingStrategy || 'ONLY_ATTENDANCE',
        };
    }

    async updateConfig(schoolId: number, dto: UpdateAttendanceConfigDto) {
        const [config] = await Promise.all([
            this.prisma.attendanceConfig.upsert({
                where: {
                    schoolId_academicYearId: {
                        schoolId,
                        academicYearId: dto.academicYearId
                    }
                },
                create: {
                    schoolId,
                    academicYearId: dto.academicYearId,
                    mode: dto.mode,
                    responsibility: dto.responsibility,
                },
                update: {
                    mode: dto.mode,
                    responsibility: dto.responsibility,
                },
                select: {
                    mode: true,
                    responsibility: true,
                }
            }),
            this.prisma.schoolSettings.upsert({
                where: { schoolId },
                create: {
                    schoolId,
                    trackingStrategy: dto.trackingStrategy,
                    // Note: In a real scenario, other mandatory fields would need defaults
                    schoolStartTime: new Date(),
                    schoolEndTime: new Date(),
                },
                update: {
                    trackingStrategy: dto.trackingStrategy,
                }
            })
        ]);

        const schoolSettings = await this.prisma.schoolSettings.findUnique({
            where: { schoolId },
            select: { trackingStrategy: true }
        });

        return {
            ...config,
            trackingStrategy: schoolSettings?.trackingStrategy || 'ONLY_ATTENDANCE',
        };
    }
}
