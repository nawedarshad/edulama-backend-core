import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class AcademicYearService {
    constructor(private prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateAcademicYearDto) {
        if (new Date(dto.endDate) <= new Date(dto.startDate)) {
            throw new BadRequestException('End date must be after start date');
        }

        // If making this active, deactivate others (or check logic)
        // For now, let's just allow creating. "One active year" rule enforced on status update.
        if (dto.status === AcademicYearStatus.ACTIVE) {
            await this.deactivateOtherYears(schoolId);
        }

        return this.prisma.academicYear.create({
            data: {
                schoolId,
                name: dto.name,
                startDate: new Date(dto.startDate),
                endDate: new Date(dto.endDate),
                status: dto.status || AcademicYearStatus.PLANNED,
            },
        });
    }

    async findAll(schoolId: number) {
        return this.prisma.academicYear.findMany({
            where: { schoolId },
            orderBy: { startDate: 'desc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        const year = await this.prisma.academicYear.findFirst({
            where: { id, schoolId },
        });
        if (!year) throw new NotFoundException('Academic year not found');
        return year;
    }

    async findActive(schoolId: number) {
        const year = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE },
        });
        return year; // Returns null if none active, which is valid state
    }

    async update(schoolId: number, id: number, dto: UpdateAcademicYearDto) {
        const year = await this.findOne(schoolId, id);

        // Immutable check
        if (year.status === AcademicYearStatus.CLOSED) {
            // Allow status change BACK to ACTIVE/ARCHIVED? Or completely locked?
            // User said: "Dates can only be edited when status != CLOSED"
            // So if trying to edit DATES and status is CLOSED, block it.
            if (dto.startDate || dto.endDate) {
                throw new BadRequestException('Cannot modify dates of a CLOSED academic year');
            }
        }

        if (dto.startDate || dto.endDate) {
            const start = dto.startDate ? new Date(dto.startDate) : year.startDate;
            const end = dto.endDate ? new Date(dto.endDate) : year.endDate;
            if (end <= start) {
                throw new BadRequestException('End date must be after start date');
            }
        }

        if (dto.status === AcademicYearStatus.ACTIVE && year.status !== AcademicYearStatus.ACTIVE) {
            await this.deactivateOtherYears(schoolId, id);
        }

        return this.prisma.academicYear.update({
            where: { id },
            data: {
                name: dto.name,
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                endDate: dto.endDate ? new Date(dto.endDate) : undefined,
                status: dto.status,
            },
        });
    }

    private async deactivateOtherYears(schoolId: number, excludeId?: number) {
        await this.prisma.academicYear.updateMany({
            where: {
                schoolId,
                status: AcademicYearStatus.ACTIVE,
                id: { not: excludeId },
            },
            data: { status: AcademicYearStatus.CLOSED }, // Or PLANNED? CLOSED is safer for history.
        });
    }
}
