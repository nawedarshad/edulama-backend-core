
import { Injectable, InternalServerErrorException, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { GetRoomsDto } from './dto/get-rooms.dto';
import { AssignRoomDto } from './dto/assign-room.dto';
import { BulkCreateRoomDto } from './dto/bulk-create-room.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class RoomService {
    private readonly logger = new Logger(RoomService.name);

    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, dto: GetRoomsDto) {
        const { search, status, block, floor, roomType, page = 1, limit = 20 } = dto;
        const skip = (page - 1) * limit;

        const where: Prisma.RoomWhereInput = {
            schoolId,
            AND: [], // Initialize allow pushing conditions
        };

        // If simple object assignment is better for AND
        if (status) {
            (where.AND as any[]).push({ status: status });
        }

        if (block) {
            (where.AND as any[]).push({ block: { contains: block, mode: 'insensitive' } });
        }

        if (floor !== undefined) {
            (where.AND as any[]).push({ floor: floor });
        }

        if (roomType) {
            (where.AND as any[]).push({ roomType: roomType });
        }

        if (search) {
            (where.AND as any[]).push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                    { block: { contains: search, mode: 'insensitive' } },
                ],
            });
        }

        const [rooms, total] = await Promise.all([
            this.prisma.room.findMany({
                where,
                include: {
                    assignments: {
                        where: { isActive: true },
                        include: {
                            section: {
                                include: {
                                    class: {
                                        select: {
                                            name: true,
                                            level: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: [
                    { block: 'asc' },
                    { floor: 'asc' },
                    { name: 'asc' },
                ],
            }),
            this.prisma.room.count({ where }),
        ]);

        const transformedRooms = rooms.map((room) => {
            const activeAssignment = room.assignments[0];

            return {
                id: room.id,
                name: room.name,
                code: room.code || '',
                block: room.block,
                floor: room.floor,
                status: room.status,
                type: room.roomType,
                capacity: room.capacity,
                facilities: room.facilities,
                assignedTo: activeAssignment && activeAssignment.section
                    ? {
                        sectionId: activeAssignment.sectionId,
                        sectionName: activeAssignment.section.name,
                        className: activeAssignment.section.class.name,
                    }
                    : null,
                createdAt: room.createdAt,
                updatedAt: room.updatedAt,
            };
        });

        return {
            rooms: transformedRooms,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    async create(schoolId: number, dto: CreateRoomDto) {
        try {
            const room = await this.prisma.room.create({
                data: {
                    name: dto.name,
                    code: dto.code || null,
                    block: dto.block,
                    floor: dto.floor,
                    roomType: dto.roomType,
                    status: dto.status || 'ACTIVE',
                    capacity: dto.capacity,
                    facilities: dto.facilities,
                    schoolId,
                },
            });
            return room;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Room with this code already exists for this school');
            }
            this.logger.error('Error creating room', error);
            throw new InternalServerErrorException('Internal server error');
        }
    }
    async findOne(schoolId: number, id: number) {
        const room = await this.prisma.room.findFirst({
            where: {
                id,
                schoolId,
            },
            include: {
                assignments: {
                    where: { isActive: true },
                    include: {
                        section: {
                            include: {
                                class: {
                                    select: {
                                        name: true,
                                        level: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!room) {
            throw new NotFoundException('Room not found');
        }

        const activeAssignment = room.assignments[0];

        return {
            id: room.id,
            name: room.name,
            code: room.code || '',
            block: room.block,
            floor: room.floor,
            status: room.status,
            type: room.roomType,
            capacity: room.capacity,
            facilities: room.facilities,
            assignedTo: activeAssignment
                ? {
                    sectionId: activeAssignment.sectionId,
                    sectionName: activeAssignment.section.name,
                    className: activeAssignment.section.class.name,
                }
                : null,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
        };
    }

    async update(schoolId: number, id: number, dto: UpdateRoomDto) {
        const existingRoom = await this.prisma.room.findFirst({
            where: { id, schoolId },
        });

        if (!existingRoom) {
            throw new NotFoundException('Room not found');
        }

        try {
            const room = await this.prisma.room.update({
                where: { id },
                data: {
                    ...dto,
                },
            });
            return room;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new BadRequestException('Room with this code already exists for this school');
            }
            this.logger.error('Error updating room', error);
            throw new InternalServerErrorException('Internal server error');
        }
    }

    async remove(schoolId: number, id: number) {
        const existingRoom = await this.prisma.room.findFirst({
            where: { id, schoolId },
            include: {
                assignments: {
                    where: { isActive: true }
                }
            }
        });

        if (!existingRoom) {
            throw new NotFoundException('Room not found');
        }

        if (existingRoom.assignments.length > 0) {
            throw new BadRequestException('Cannot delete room with active assignments');
        }

        try {
            await this.prisma.room.delete({
                where: { id },
            });
            return { message: 'Room deleted successfully' };
        } catch (error) {
            this.logger.error('Error deleting room', error);
            throw new InternalServerErrorException('Error deleting room');
        }
    }

    async assignRoom(schoolId: number, dto: AssignRoomDto) {
        // 1. Check if room exists and belongs to school
        const room = await this.prisma.room.findFirst({
            where: { id: dto.roomId, schoolId },
        });

        if (!room) {
            throw new NotFoundException('Room not found');
        }

        // 2. Check if section exists and belongs to school
        const section = await this.prisma.section.findFirst({
            where: { id: dto.sectionId, schoolId },
            include: { academicYear: true } // Need academicYearId for assignment
        });

        if (!section) {
            throw new NotFoundException('Section not found');
        }

        // 3. Upsert assignment
        // We use upsert to handle re-assignment or activating existing inactive assignment
        try {
            const assignment = await this.prisma.roomAssignment.upsert({
                where: {
                    schoolId_academicYearId_sectionId: {
                        schoolId,
                        academicYearId: section.academicYearId,
                        sectionId: dto.sectionId,
                    }
                },
                create: {
                    schoolId,
                    academicYearId: section.academicYearId,
                    roomId: dto.roomId,
                    sectionId: dto.sectionId,
                    isActive: dto.isActive ?? true,
                },
                update: {
                    roomId: dto.roomId,
                    isActive: dto.isActive ?? true,
                }
            });
            return assignment;
        } catch (error) {
            this.logger.error('Error assigning room', error);
            throw new InternalServerErrorException('Failed to assign room');
        }
    }

    async unassignRoom(schoolId: number, roomId: number, sectionId: number) {
        // Verify room ownership
        const room = await this.prisma.room.findFirst({
            where: { id: roomId, schoolId },
        });

        if (!room) {
            throw new NotFoundException('Room not found');
        }

        try {
            // Find assignment by room and section (and potentially active year, but let's assume current context)
            // Ideally we delete by unique composite key, but here we are unassigning a specific link.
            // Since strict uniqueness is on [schoolId, academicYearId, sectionId], we should probably look it up first or deleteMany.
            // However, the prompt asks to unassign. Let's delete the assignment record directly if we can find it.

            // To be safe and precise with the schema:
            await this.prisma.roomAssignment.deleteMany({
                where: {
                    schoolId,
                    roomId,
                    sectionId
                }
            });

            return { message: 'Room unassigned successfully' };
        } catch (error) {
            this.logger.error('Error unassigning room', error);
            throw new InternalServerErrorException('Failed to unassign room');
        }
    }

    async bulkCreate(schoolId: number, dto: BulkCreateRoomDto) {
        try {
            const count = await this.prisma.$transaction(async (tx) => {
                const result = await tx.room.createMany({
                    data: dto.rooms.map(room => ({
                        ...room,
                        schoolId,
                        status: room.status || 'ACTIVE',
                        facilities: room.facilities || [],
                    })),
                    skipDuplicates: true,
                });
                return result.count;
            });
            return { message: 'Rooms uploaded successfully', count };
        } catch (error) {
            this.logger.error('Error bulk creating rooms', error);
            throw new InternalServerErrorException('Failed to bulk create rooms');
        }
    }

    getTemplate() {
        return [
            {
                name: "Lab 1",
                code: "L-101",
                block: "Science Block",
                floor: 1,
                roomType: "LAB",
                status: "ACTIVE",
                capacity: 30,
                facilities: ["Computers", "Projector"]
            },
            {
                name: "Class 10-A",
                code: "C-202",
                block: "Main Block",
                floor: 2,
                roomType: "CLASSROOM",
                status: "ACTIVE",
                capacity: 40,
                facilities: ["Blackboard"]
            }
        ];
    }
}
