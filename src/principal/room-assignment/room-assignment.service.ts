import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomAssignmentDto } from './dto/create-room-assignment.dto';
import { UpdateRoomAssignmentDto } from './dto/update-room-assignment.dto';
import { AcademicYearStatus } from '@prisma/client';

@Injectable()
export class RoomAssignmentService {
    private readonly logger = new Logger(RoomAssignmentService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateRoomAssignmentDto) {
        // 1. Get active academic year
        const activeAcademicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: AcademicYearStatus.ACTIVE },
        });

        if (!activeAcademicYear) {
            throw new BadRequestException('No active academic year found');
        }

        // 2. Validate Section
        const section = await this.prisma.section.findFirst({
            where: { id: dto.sectionId, schoolId },
        });
        if (!section) throw new NotFoundException('Section not found');

        // 3. Validate Room
        const room = await this.prisma.room.findFirst({
            where: { id: dto.roomId, schoolId },
        });
        if (!room) throw new NotFoundException('Room not found');

        // 4. Check for existing assignment
        const existing = await this.prisma.roomAssignment.findUnique({
            where: {
                schoolId_academicYearId_sectionId: {
                    schoolId,
                    academicYearId: activeAcademicYear.id,
                    sectionId: dto.sectionId,
                },
            },
        });

        if (existing) {
            throw new BadRequestException('Section is already assigned to a room for this academic year');
        }

        // 5. Create
        return this.prisma.roomAssignment.create({
            data: {
                schoolId,
                academicYearId: activeAcademicYear.id,
                sectionId: dto.sectionId,
                roomId: dto.roomId,
            },
            include: {
                room: true,
                section: true,
            },
        });
    }

    async findAll(schoolId: number) {
        // We might want to filter by active academic year default?
        // User said "EVERYTHING GET", usually implies current state. 
        // I will return all for the school but ordered by recent. Or filter by active AY?
        // Better to show everything but maybe prioritize current AY.
        // For now, simple findAll for school.

        return this.prisma.roomAssignment.findMany({
            where: { schoolId },
            include: {
                room: true,
                section: {
                    include: {
                        class: true,
                    }
                },
                academicYear: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        const assignment = await this.prisma.roomAssignment.findFirst({
            where: { id, schoolId },
            include: {
                room: true,
                section: true,
            },
        });

        if (!assignment) throw new NotFoundException(`Assignment with ID ${id} not found`);
        return assignment;
    }

    async update(schoolId: number, id: number, dto: UpdateRoomAssignmentDto) {
        await this.findOne(schoolId, id); // Validate existence

        if (dto.roomId) {
            const room = await this.prisma.room.findFirst({
                where: { id: dto.roomId, schoolId },
            });
            if (!room) throw new NotFoundException('Target Room not found');
        }

        try {
            return await this.prisma.roomAssignment.update({
                where: { id },
                data: {
                    roomId: dto.roomId,
                    isActive: dto.isActive,
                },
                include: { room: true, section: true },
            });
        } catch (error) {
            this.logger.error('Error updating assignment', error);
            throw new InternalServerErrorException('Failed to update assignment');
        }
    }

    async remove(schoolId: number, id: number) {
        await this.findOne(schoolId, id); // Validate existence

        try {
            await this.prisma.roomAssignment.delete({
                where: { id },
            });
            return { message: 'Assignment deleted successfully' };
        } catch (error) {
            this.logger.error('Error deleting assignment', error);
            throw new InternalServerErrorException('Failed to delete assignment');
        }
    }
}
