import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';
import { DayOfWeek, AcademicYearStatus } from '@prisma/client';

@Injectable()
export class TimeSlotService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, day?: DayOfWeek) {
        return this.prisma.timeSlot.findMany({
            where: {
                schoolId,
                ...(day && { day }),
            },
            include: {
                period: true,
            },
            orderBy: [
                { day: 'asc' },
                { period: { startTime: 'asc' } },
            ],
        });
    }

    async findOne(schoolId: number, id: number) {
        const timeSlot = await this.prisma.timeSlot.findFirst({
            where: { id, schoolId },
            include: { period: true },
        });

        if (!timeSlot) throw new NotFoundException('Time slot not found');
        return timeSlot;
    }

    async create(schoolId: number, dto: CreateTimeSlotDto) {
        // 0. Get Active Academic Year
        const activeYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE },
        });
        if (!activeYear) throw new BadRequestException('No active academic year found');

        // Ensure period belongs to school
        let period = await this.prisma.timePeriod.findFirst({
            where: { id: dto.periodId, schoolId },
        });

        if (!period && dto.period) {
            // If ID not found but data provided, try to find by name or create
            // We use findFirst instead of upsert directly because we want to be safe about schoolId
            period = await this.prisma.timePeriod.findFirst({
                where: { schoolId, name: dto.period.name }
            });

            if (!period) {
                period = await this.prisma.timePeriod.create({
                    data: {
                        schoolId,
                        name: dto.period.name,
                        startTime: dto.period.startTime,
                        endTime: dto.period.endTime
                    }
                });
            }
        }

        if (!period) throw new NotFoundException('Time period not found');

        // Check for overlaps
        await this.validateOverlap(schoolId, dto.day, period.startTime, period.endTime);

        return this.prisma.timeSlot.create({
            data: {
                schoolId,
                academicYearId: activeYear.id,
                day: dto.day,
                periodId: period.id,
                description: dto.description,
                isBreak: dto.isBreak || false,
            },
        });
    }

    async update(schoolId: number, id: number, dto: UpdateTimeSlotDto) {
        const existingDefault = await this.findOne(schoolId, id); // check existence

        // If updating period or day, check for overlaps
        if (dto.periodId || dto.day) {
            const dayToCheck = dto.day || existingDefault.day;
            const periodIdToCheck = dto.periodId || existingDefault.periodId;

            // Get Period Details
            const period = await this.prisma.timePeriod.findFirst({
                where: { id: periodIdToCheck, schoolId },
            });
            if (!period) throw new NotFoundException('Time period not found');

            await this.validateOverlap(schoolId, dayToCheck, period.startTime, period.endTime, id);
        }

        return this.prisma.timeSlot.update({
            where: { id },
            data: {
                day: dto.day,
                periodId: dto.periodId,
                description: dto.description,
                isBreak: dto.isBreak,
            },
        });
    }

    async remove(schoolId: number, id: number) {
        await this.findOne(schoolId, id);
        return this.prisma.timeSlot.delete({
            where: { id },
        });
    }

    private async validateOverlap(schoolId: number, day: DayOfWeek, startTime: Date | string, endTime: Date | string, excludeId?: number) {
        const existingSlots = await this.prisma.timeSlot.findMany({
            where: {
                schoolId,
                day,
                ...(excludeId && { id: { not: excludeId } }), // Exclude self if updating
            },
            include: { period: true },
        });

        const newStart = new Date(startTime).getTime();
        const newEnd = new Date(endTime).getTime();

        for (const slot of existingSlots) {
            const existingStart = new Date(slot.period.startTime).getTime();
            const existingEnd = new Date(slot.period.endTime).getTime();

            // Check for overlap: (StartA < EndB) and (EndA > StartB)
            if (newStart < existingEnd && newEnd > existingStart) {
                const sTime = new Date(slot.period.startTime).toISOString().split('T')[1].substring(0, 5);
                const eTime = new Date(slot.period.endTime).toISOString().split('T')[1].substring(0, 5);
                throw new BadRequestException(
                    `Time slot overlaps with existing slot: ${slot.period.name} (${sTime} - ${eTime})`
                );
            }
        }
    }
}
