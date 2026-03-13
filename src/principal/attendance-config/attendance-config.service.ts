import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAttendanceConfigDto } from './dto/update-config.dto';
import { AttendanceMode, AttendanceTrackingStrategy, DailyAttendanceAccess, LateMarkingResponsibility, LateAttendanceStatus } from './attendance-enums';

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
            (this.prisma.schoolSettings as any).findUnique({
                where: { schoolId },
                select: { attendanceMode: true, dailyAttendanceAccess: true, trackingStrategy: true, lateMarkingResponsibility: true } 
            }) as any
        ]);

        // If no config exists for this AY, return defaults from school settings
        if (!config) {
            return {
                mode: schoolSettings?.attendanceMode || 'DAILY',
                responsibility: schoolSettings?.dailyAttendanceAccess || 'CLASS_TEACHER',
                trackingStrategy: schoolSettings?.trackingStrategy || 'SIMPLE',
                lateMarkingResponsibility: schoolSettings?.lateMarkingResponsibility || 'TAKER',
                warning: 'Configuration not found for this academic year, returning defaults from SchoolSettings.'
            };
        }

        return {
            ...config,
            trackingStrategy: schoolSettings?.trackingStrategy || 'SIMPLE',
            lateMarkingResponsibility: schoolSettings?.lateMarkingResponsibility || 'TAKER',
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
            this.prisma.schoolSettings.update({
                where: { schoolId },
                data: {
                    attendanceMode: dto.mode,
                    dailyAttendanceAccess: dto.responsibility,
                    trackingStrategy: dto.trackingStrategy,
                    lateMarkingResponsibility: dto.lateMarkingResponsibility || 'TAKER',
                    lateCountingPolicy: dto.lateCountingPolicy || 'LATE',
                }
            })
        ]);

        const schoolSettings = await this.prisma.schoolSettings.findUnique({
            where: { schoolId },
            select: { 
                trackingStrategy: true,
                lateMarkingResponsibility: true,
                lateCountingPolicy: true,
                isTrackingStrategyLocked: true,
            }
        });

        return {
            ...config,
            trackingStrategy: schoolSettings?.trackingStrategy,
            lateMarkingResponsibility: schoolSettings?.lateMarkingResponsibility,
            lateCountingPolicy: schoolSettings?.lateCountingPolicy,
            isTrackingStrategyLocked: schoolSettings?.isTrackingStrategyLocked,
        };
    }
}
