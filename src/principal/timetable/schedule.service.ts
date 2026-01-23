import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class ScheduleService {
    constructor(private readonly prisma: PrismaService) { }

    async createSchedule(schoolId: number, academicYearId: number, dto: CreateScheduleDto) {
        // Check if name already exists
        const existing = await this.prisma.schedule.findFirst({
            where: {
                schoolId,
                academicYearId,
                name: dto.name,
            },
        });

        if (existing) {
            throw new ConflictException('Schedule with this name already exists for this academic year');
        }

        // If setting as default, unset other defaults
        if (dto.isDefault) {
            await this.prisma.schedule.updateMany({
                where: { schoolId, academicYearId, isDefault: true },
                data: { isDefault: false },
            });
        }

        return this.prisma.schedule.create({
            data: {
                schoolId,
                academicYearId,
                ...dto,
            },
            include: {
                timePeriods: true,
            },
        });
    }

    async findAllSchedules(schoolId: number, academicYearId: number) {
        return this.prisma.schedule.findMany({
            where: { schoolId, academicYearId },
            include: {
                timePeriods: {
                    orderBy: { startTime: 'asc' },
                },
                _count: {
                    select: {
                        timePeriods: true,
                        classes: true,
                    },
                },
            },
            orderBy: [
                { isDefault: 'desc' },
                { name: 'asc' },
            ],
        });
    }

    async findOne(schoolId: number, id: number) {
        const schedule = await this.prisma.schedule.findFirst({
            where: { id, schoolId },
            include: {
                timePeriods: {
                    orderBy: { startTime: 'asc' },
                },
                classes: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!schedule) {
            throw new NotFoundException('Schedule not found');
        }

        return schedule;
    }

    async updateSchedule(schoolId: number, id: number, dto: UpdateScheduleDto) {
        const schedule = await this.findOne(schoolId, id);

        // If setting as default, unset other defaults
        if (dto.isDefault) {
            await this.prisma.schedule.updateMany({
                where: {
                    schoolId,
                    academicYearId: schedule.academicYearId,
                    isDefault: true,
                    id: { not: id }
                },
                data: { isDefault: false },
            });
        }

        return this.prisma.schedule.update({
            where: { id },
            data: dto,
            include: {
                timePeriods: true,
            },
        });
    }

    async deleteSchedule(schoolId: number, id: number) {
        const schedule = await this.findOne(schoolId, id);

        // Check if any classes are using this schedule
        const classCount = await this.prisma.class.count({
            where: { scheduleId: id },
        });

        if (classCount > 0) {
            throw new BadRequestException(`Cannot delete schedule. ${classCount} class(es) are currently using this schedule.`);
        }

        return this.prisma.schedule.delete({
            where: { id },
        });
    }

    async setAsDefault(schoolId: number, academicYearId: number, id: number) {
        const schedule = await this.findOne(schoolId, id);

        if (schedule.academicYearId !== academicYearId) {
            throw new BadRequestException('Schedule does not belong to this academic year');
        }

        // Unset other defaults
        await this.prisma.schedule.updateMany({
            where: {
                schoolId,
                academicYearId,
                isDefault: true,
                id: { not: id }
            },
            data: { isDefault: false },
        });

        return this.prisma.schedule.update({
            where: { id },
            data: { isDefault: true },
        });
    }

    async duplicateSchedule(schoolId: number, fromScheduleId: number, newName: string) {
        const sourceSchedule = await this.findOne(schoolId, fromScheduleId);

        // Create new schedule
        const newSchedule = await this.prisma.schedule.create({
            data: {
                schoolId,
                academicYearId: sourceSchedule.academicYearId,
                name: newName,
                description: sourceSchedule.description,
                isActive: true,
                isDefault: false,
            },
        });

        // Copy all periods
        if (sourceSchedule.timePeriods.length > 0) {
            await this.prisma.timePeriod.createMany({
                data: sourceSchedule.timePeriods.map(period => ({
                    schoolId,
                    academicYearId: sourceSchedule.academicYearId,
                    scheduleId: newSchedule.id,
                    name: period.name,
                    startTime: period.startTime,
                    endTime: period.endTime,
                    type: period.type,
                    days: period.days,
                })),
            });
        }

        return this.findOne(schoolId, newSchedule.id);
    }
}
