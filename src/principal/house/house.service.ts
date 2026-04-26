import { Injectable, NotFoundException, Logger, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogEvent } from '../../common/audit/audit.event';

@Injectable()
export class HouseService {
    private readonly logger = new Logger(HouseService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2
    ) { }

    private async validateLeadership(schoolId: number, dto: CreateHouseDto | UpdateHouseDto, houseId?: number) {
        if (dto.houseMasterId) {
            const teacher = await this.prisma.teacherProfile.findFirst({
                where: { id: dto.houseMasterId, schoolId }
            });
            if (!teacher) throw new NotFoundException('Specified House Master not found or not in this school');
        }

        if (dto.captainStudentId) {
            const student = await this.prisma.studentProfile.findFirst({
                where: { id: dto.captainStudentId, schoolId }
            });
            if (!student) throw new NotFoundException('Specified House Captain not found');
            if (houseId && student.houseId !== houseId) {
                throw new ConflictException('Specified House Captain must be a member of this house');
            }
        }

        if (dto.viceCaptainStudentId) {
            const student = await this.prisma.studentProfile.findFirst({
                where: { id: dto.viceCaptainStudentId, schoolId }
            });
            if (!student) throw new NotFoundException('Specified House Vice Captain not found');
            if (houseId && student.houseId !== houseId) {
                throw new ConflictException('Specified House Vice Captain must be a member of this house');
            }
        }
    }

    async create(schoolId: number, dto: CreateHouseDto, userId: number) {
        this.logger.log(`Creating new house for school ${schoolId}: ${dto.name}`);
        
        await this.validateLeadership(schoolId, dto);

        try {
            const house = await this.prisma.house.create({
                data: {
                    ...dto,
                    schoolId,
                },
            });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId, userId, 'HOUSE', 'CREATE', house.id, { name: house.name }
            ));

            this.logger.log(`House created successfully: ${house.id}`);
            return house;
        } catch (error: any) {
            if (error.code === 'P2002') {
                this.logger.warn(`House with name ${dto.name} already exists for school ${schoolId}`);
                throw new ConflictException(`House with name "${dto.name}" already exists.`);
            }
            this.logger.error(`Error creating house: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create house');
        }
    }

    async findAll(schoolId: number) {
        this.logger.log(`Fetching all houses for school ${schoolId}`);
        try {
            const houses = await this.prisma.house.findMany({
                where: { schoolId },
                include: {
                    houseMaster: { select: { id: true, user: { select: { name: true, photo: true } } } },
                    captain: { select: { id: true, fullName: true, admissionNo: true } },
                    viceCaptain: { select: { id: true, fullName: true, admissionNo: true } },
                    _count: {
                        select: { studentProfiles: true }
                    }
                },
                orderBy: { name: 'asc' },
            });

            return houses.map(h => ({
                ...h,
                studentCount: h._count.studentProfiles
            }));
        } catch (error) {
            this.logger.error(`Error fetching houses: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to fetch houses');
        }
    }

    async getStats(schoolId: number) {
        try {
            const [totalStudents, totalAllocated] = await Promise.all([
                this.prisma.studentProfile.count({ where: { schoolId } }),
                this.prisma.studentProfile.count({ 
                    where: { 
                        schoolId,
                        houseId: { not: null }
                    } 
                })
            ]);

            return {
                totalStudents,
                totalAllocated,
                totalUnallocated: totalStudents - totalAllocated,
                participationRate: totalStudents > 0 ? (totalAllocated / totalStudents) * 100 : 0
            };
        } catch (error) {
            this.logger.error(`Error fetching house stats: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to fetch house statistics');
        }
    }

    async findOne(schoolId: number, id: number) {
        try {
            const house = await this.prisma.house.findFirst({
                where: { id, schoolId },
                include: {
                    houseMaster: { select: { id: true, user: { select: { name: true, photo: true } } } },
                    captain: { select: { id: true, fullName: true, admissionNo: true } },
                    viceCaptain: { select: { id: true, fullName: true, admissionNo: true } },
                    _count: {
                        select: { studentProfiles: true }
                    }
                },
            });

            if (!house) {
                this.logger.warn(`House with ID ${id} not found in school ${schoolId}`);
                throw new NotFoundException(`House with ID ${id} not found`);
            }

            return house;
        } catch (error: any) {
            if (error instanceof NotFoundException) throw error;
            this.logger.error(`Error fetching house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to fetch house details');
        }
    }

    async getHouseStudents(schoolId: number, houseId: number, queryDto: PaginationQueryDto) {
        // Ensure house exists first
        await this.findOne(schoolId, houseId);

        const { page = 1, limit = 10, search = '' } = queryDto;
        const skip = (page - 1) * limit;

        const where: any = {
            schoolId,
            houseId,
        };

        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { admissionNo: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [students, total] = await Promise.all([
            this.prisma.studentProfile.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true,
                    fullName: true,
                    admissionNo: true,
                    photo: true,
                    class: { select: { name: true, id: true } },
                    section: { select: { name: true, id: true } },
                },
                orderBy: { fullName: 'asc' },
            }),
            this.prisma.studentProfile.count({ where }),
        ]);

        return {
            data: students.map(s => ({
                id: s.id,
                fullName: s.fullName,
                admissionNo: s.admissionNo,
                photo: s.photo,
                class: s.class?.name,
                section: s.section?.name,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async update(schoolId: number, id: number, dto: UpdateHouseDto, userId: number) {
        this.logger.log(`Updating house ${id} for school ${schoolId}`);

        await this.validateLeadership(schoolId, dto, id);

        try {
            const currentHouse = await this.findOne(schoolId, id);
            
            const updatedHouse = await this.prisma.house.updateMany({
                where: { id, schoolId },
                data: dto,
            });

            if (updatedHouse.count === 0) {
                throw new NotFoundException(`House with ID ${id} not found`);
            }

            const refreshedHouse = await this.findOne(schoolId, id);

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId, userId, 'HOUSE', 'UPDATE', id, { 
                    before: { name: currentHouse.name },
                    after: { name: refreshedHouse.name }
                }
            ));

            this.logger.log(`House ${id} updated successfully`);
            return refreshedHouse;
        } catch (error: any) {
            if (error instanceof NotFoundException) throw error;
            if (error.code === 'P2002') {
                throw new ConflictException(`House with name "${dto.name}" already exists.`);
            }
            this.logger.error(`Error updating house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update house');
        }
    }

    async remove(schoolId: number, id: number, userId: number) {
        this.logger.log(`Removing house ${id} for school ${schoolId}`);

        try {
            const house = await this.prisma.house.findFirst({
                where: { id, schoolId }
            });

            if (!house) throw new NotFoundException(`House with ID ${id} not found`);

            // Check structural integrity before deletion
            const assignedStudents = await this.prisma.studentProfile.count({
                where: { houseId: id, schoolId }
            });

            if (assignedStudents > 0) {
                throw new ConflictException(`Cannot delete house with ${assignedStudents} assigned students. Unassign them first.`);
            }

            await this.prisma.house.delete({
                where: { id },
            });

            this.eventEmitter.emit('audit.log', new AuditLogEvent(
                schoolId, userId, 'HOUSE', 'DELETE', id, { name: house.name }
            ));

            this.logger.log(`House ${id} deleted successfully`);
            return { message: 'House deleted successfully' };
        } catch (error: any) {
            if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
            this.logger.error(`Error deleting house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete house');
        }
    }
}
