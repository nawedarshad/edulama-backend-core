import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateAttendanceConfigDto } from './dto/update-config.dto';

@Injectable()
export class AttendanceConfigService {
    constructor(private readonly prisma: PrismaService) { }

    async getConfig(schoolId: number, academicYearId: number) {
        const config = await this.prisma.attendanceConfig.findUnique({
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
        });

        // If no config exists for this AY, return defaults
        if (!config) {
            return {
                mode: 'DAILY',
                responsibility: 'CLASS_TEACHER',
                warning: 'Configuration not found for this academic year, returning defaults.'
            };
        }

        return config;
    }

    async updateConfig(schoolId: number, dto: UpdateAttendanceConfigDto) {
        const config = await this.prisma.attendanceConfig.upsert({
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
        });

        return config;
    }
}
