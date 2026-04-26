import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class AcademicYearService {
    constructor(private prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateAcademicYearDto) {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        if (end <= start) {
            throw new BadRequestException('End date must be after start date');
        }

        return this.prisma.$transaction(async (tx) => {
            // Enterprise Overlap Guard
            await this.checkOverlap(schoolId, start, end, undefined, tx);

            // Single Active Year Policy
            if (dto.status === AcademicYearStatus.ACTIVE) {
                await this.deactivateOtherYears(schoolId, undefined, tx);
            }

            return tx.academicYear.create({
                data: {
                    schoolId,
                    name: dto.name,
                    startDate: start,
                    endDate: end,
                    status: dto.status || AcademicYearStatus.PLANNED,
                },
            });
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
        return this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE },
        });
    }

    async update(schoolId: number, id: number, dto: UpdateAcademicYearDto) {
        return this.prisma.$transaction(async (tx) => {
            const year = await tx.academicYear.findFirst({
                where: { id, schoolId },
            });
            if (!year) throw new NotFoundException('Academic year not found');

            // Immutable protection for CLOSED years
            if (year.status === AcademicYearStatus.CLOSED && (dto.startDate || dto.endDate)) {
                throw new BadRequestException('Cannot modify dates of a CLOSED academic year');
            }

            const start = dto.startDate ? new Date(dto.startDate) : year.startDate;
            const end = dto.endDate ? new Date(dto.endDate) : year.endDate;

            if (dto.startDate || dto.endDate) {
                if (end <= start) {
                    throw new BadRequestException('End date must be after start date');
                }
                await this.checkOverlap(schoolId, start, end, id, tx);
            }

            if (dto.status === AcademicYearStatus.ACTIVE && year.status !== AcademicYearStatus.ACTIVE) {
                await this.deactivateOtherYears(schoolId, id, tx);
            }

            return tx.academicYear.update({
                where: { id, schoolId },
                data: {
                    name: dto.name,
                    startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                    endDate: dto.endDate ? new Date(dto.endDate) : undefined,
                    status: dto.status,
                },
            });
        });
    }

    private async deactivateOtherYears(schoolId: number, excludeId?: number, tx?: any) {
        const db = tx || this.prisma;
        await db.academicYear.updateMany({
            where: {
                schoolId,
                status: AcademicYearStatus.ACTIVE,
                id: { not: excludeId },
            },
            // BUG FIX: Use PLANNED not CLOSED. CLOSED is a terminal/immutable state and should
            // only be set explicitly by a principal. Activating a new year should just un-activate others.
            data: { status: AcademicYearStatus.PLANNED },
        });
    }

    private async checkOverlap(schoolId: number, startDate: Date, endDate: Date, excludeId?: number, tx?: any) {
        const db = tx || this.prisma;
        // Mathematical Interval Overlap: (StartA < EndB) && (EndA > StartB)
        const overlapping = await db.academicYear.findFirst({
            where: {
                schoolId,
                id: excludeId ? { not: excludeId } : undefined,
                AND: [
                    { startDate: { lt: endDate } },
                    { endDate: { gt: startDate } }
                ]
            },
        });

        if (overlapping) {
            throw new BadRequestException(
                `Date range overlaps with existing year: ${overlapping.name} (${overlapping.startDate.toISOString().split('T')[0]} to ${overlapping.endDate.toISOString().split('T')[0]})`
            );
        }
    }
}
