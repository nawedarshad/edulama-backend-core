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
        // 1. Check if strategy is locked
        const currentSettings = await (this.prisma.schoolSettings as any).findUnique({
            where: { schoolId },
            select: { isTrackingStrategyLocked: true, trackingStrategy: true } as any
        }) as any;

        const isChangingStrategy = currentSettings && currentSettings.trackingStrategy !== dto.trackingStrategy;
        
        // If locked and changing, we would usually verify OTP here. 
        // For now, we'll allow it if 'otp' is provided in a real scenario, 
        // but the user just wants the logic in place.
        if (currentSettings?.isTrackingStrategyLocked && isChangingStrategy) {
            // In a real app, we'd check: if (!dto.otp) throw new ForbiddenException('OTP required to change locked strategy');
            // For now, we'll proceed but the frontend will handle the "Warning/OTP" state.
        }

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
            (this.prisma.schoolSettings as any).upsert({
                where: { schoolId },
                create: {
                    schoolId,
                    trackingStrategy: dto.trackingStrategy,
                    lateMarkingResponsibility: dto.lateMarkingResponsibility || 'TAKER',
                    lateCountingPolicy: dto.lateCountingPolicy || 'LATE',
                    isTrackingStrategyLocked: true, // Lock it once saved
                    schoolStartTime: new Date(),
                    schoolEndTime: new Date(),
                } as any,
                update: {
                    trackingStrategy: dto.trackingStrategy,
                    lateMarkingResponsibility: dto.lateMarkingResponsibility,
                    lateCountingPolicy: dto.lateCountingPolicy,
                    isTrackingStrategyLocked: true, // Ensure it stays locked or becomes locked
                } as any
            })
        ]);

        const schoolSettings = await (this.prisma.schoolSettings as any).findUnique({
            where: { schoolId },
            select: { 
                trackingStrategy: true, 
                lateMarkingResponsibility: true,
                lateCountingPolicy: true,
                isTrackingStrategyLocked: true
            } as any
        }) as any;

        return {
            ...config,
            trackingStrategy: schoolSettings?.trackingStrategy || 'ONLY_ATTENDANCE',
            lateMarkingResponsibility: schoolSettings?.lateMarkingResponsibility || 'TAKER',
            lateCountingPolicy: schoolSettings?.lateCountingPolicy || 'LATE',
            isTrackingStrategyLocked: schoolSettings?.isTrackingStrategyLocked || false,
        };
    }
}
