import { Injectable, NotFoundException, Logger, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class HouseService {
    private readonly logger = new Logger(HouseService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateHouseDto) {
        this.logger.log(`Creating new house for school ${schoolId}: ${dto.name}`);
        try {
            const house = await this.prisma.house.create({
                data: {
                    ...dto,
                    schoolId,
                },
            });
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

    async update(schoolId: number, id: number, dto: UpdateHouseDto) {
        this.logger.log(`Updating house ${id} for school ${schoolId}`);

        try {
            const updatedHouse = await this.prisma.house.updateMany({
                where: { id, schoolId },
                data: dto,
            });

            if (updatedHouse.count === 0) {
                throw new NotFoundException(`House with ID ${id} not found`);
            }

            this.logger.log(`House ${id} updated successfully`);
            return this.findOne(schoolId, id); // Return the updated, formatted object
        } catch (error: any) {
            if (error instanceof NotFoundException) throw error;
            if (error.code === 'P2002') {
                throw new ConflictException(`House with name "${dto.name}" already exists.`);
            }
            this.logger.error(`Error updating house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update house');
        }
    }

    async remove(schoolId: number, id: number) {
        this.logger.log(`Removing house ${id} for school ${schoolId}`);

        try {
            // Check structural integrity before deletion
            const assignedStudents = await this.prisma.studentProfile.count({
                where: { houseId: id, schoolId }
            });

            if (assignedStudents > 0) {
                throw new ConflictException(`Cannot delete house with ${assignedStudents} assigned students. Unassign them first.`);
            }

            const deleteResult = await this.prisma.house.deleteMany({
                where: { id, schoolId },
            });

            if (deleteResult.count === 0) {
                throw new NotFoundException(`House with ID ${id} not found`);
            }

            this.logger.log(`House ${id} deleted successfully`);
            return { message: 'House deleted successfully' };
        } catch (error: any) {
            if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
            this.logger.error(`Error deleting house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete house');
        }
    }
}
