
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminCreateAcademicYearDto, AdminUpdateAcademicYearDto } from './dto/admin-academic-year.dto';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class AcademicYearService {
    private readonly logger = new Logger(AcademicYearService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(dto: AdminCreateAcademicYearDto) {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        if (end <= start) {
            throw new BadRequestException('End date must be after start date');
        }

        // Enforce Single Active Year Rule
        if (dto.status === AcademicYearStatus.ACTIVE) {
            const existingActive = await this.prisma.academicYear.findFirst({
                where: {
                    schoolId: dto.schoolId,
                    status: AcademicYearStatus.ACTIVE,
                },
            });
            if (existingActive) {
                throw new BadRequestException(`An active academic year already exists for school ${dto.schoolId}: ${existingActive.name}`);
            }
        }

        return this.prisma.academicYear.create({
            data: {
                schoolId: dto.schoolId,
                name: dto.name,
                startDate: start,
                endDate: end,
                status: dto.status || AcademicYearStatus.PLANNED,
            },
        });
    }

    async update(id: number, dto: AdminUpdateAcademicYearDto) {
        const existing = await this.prisma.academicYear.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Academic Year not found');

        // Check date logic if dates are being updated
        const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
        const end = dto.endDate ? new Date(dto.endDate) : existing.endDate;

        if (end <= start) {
            throw new BadRequestException('End date must be after start date');
        }

        // Active check
        if (dto.status === AcademicYearStatus.ACTIVE && existing.status !== AcademicYearStatus.ACTIVE) {
            const existingActive = await this.prisma.academicYear.findFirst({
                where: {
                    schoolId: existing.schoolId,
                    status: AcademicYearStatus.ACTIVE,
                    id: { not: id } // Exclude self
                },
            });
            if (existingActive) {
                throw new BadRequestException(`An active academic year already exists for school ${existing.schoolId}: ${existingActive.name}`);
            }
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

    async findAll() {
        // Group by name to get unique academic year names across the system
        const uniqueYears = await this.prisma.academicYear.groupBy({
            by: ['name'],
            orderBy: {
                _max: {
                    createdAt: 'desc',
                }
            },
        });

        return uniqueYears.map(year => ({
            name: year.name,
        }));
    }
}
