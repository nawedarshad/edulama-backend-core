import { Injectable, NotFoundException, Logger, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';

@Injectable()
export class HouseService {
    private readonly logger = new Logger(HouseService.name);

    constructor(private readonly prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateHouseDto) {
        this.logger.log(`Creating new house for school ${schoolId}: ${dto.name}`);
        try {
            // Check for duplicate name
            const existingHouse = await this.prisma.house.findFirst({
                where: {
                    schoolId,
                    name: { equals: dto.name, mode: 'insensitive' },
                },
            });

            if (existingHouse) {
                this.logger.warn(`House with name ${dto.name} already exists for school ${schoolId}`);
                throw new ConflictException(`House with name "${dto.name}" already exists.`);
            }

            const house = await this.prisma.house.create({
                data: {
                    ...dto,
                    schoolId,
                },
            });
            this.logger.log(`House created successfully: ${house.id}`);
            return house;
        } catch (error) {
            if (error instanceof ConflictException) throw error;
            this.logger.error(`Error creating house: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create house');
        }
    }

    async findAll(schoolId: number) {
        this.logger.log(`Fetching all houses for school ${schoolId}`);
        try {
            return await this.prisma.house.findMany({
                where: { schoolId },
                include: {
                    houseMaster: { select: { id: true, user: { select: { name: true, photo: true } } } },
                    captain: { select: { id: true, fullName: true, admissionNo: true } },
                    viceCaptain: { select: { id: true, fullName: true, admissionNo: true } },
                },
                orderBy: { name: 'asc' },
            });
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
                    studentProfiles: {
                        select: {
                            id: true,
                            fullName: true,
                            admissionNo: true,
                            photo: true,
                            class: { select: { name: true, id: true } },
                            section: { select: { name: true, id: true } }
                        }
                    },
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
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            this.logger.error(`Error fetching house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to fetch house details');
        }
    }

    async update(schoolId: number, id: number, dto: UpdateHouseDto) {
        this.logger.log(`Updating house ${id} for school ${schoolId}`);
        await this.findOne(schoolId, id); // Ensure existence and ownership

        try {
            if (dto.name) {
                const existingHouse = await this.prisma.house.findFirst({
                    where: {
                        schoolId,
                        name: { equals: dto.name, mode: 'insensitive' },
                        id: { not: id }, // Exclude current record
                    },
                });

                if (existingHouse) {
                    throw new ConflictException(`House with name "${dto.name}" already exists.`);
                }
            }

            const updatedHouse = await this.prisma.house.update({
                where: { id },
                data: dto,
            });
            this.logger.log(`House ${id} updated successfully`);
            return updatedHouse;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
            this.logger.error(`Error updating house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to update house');
        }
    }

    async remove(schoolId: number, id: number) {
        this.logger.log(`Removing house ${id} for school ${schoolId}`);
        await this.findOne(schoolId, id); // Ensure existence and ownership

        try {
            await this.prisma.house.delete({
                where: { id },
            });
            this.logger.log(`House ${id} deleted successfully`);
            return { message: 'House deleted successfully' };
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            this.logger.error(`Error deleting house ${id}: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete house');
        }
    }
}
