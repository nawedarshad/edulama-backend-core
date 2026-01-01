
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { ManageSchoolFeatureDto } from './dto/manage-school-feature.dto';

@Injectable()
export class FeaturesService {
    private readonly logger = new Logger(FeaturesService.name);

    constructor(private readonly prisma: PrismaService) { }

    async createFeature(dto: CreateFeatureDto) {
        const existing = await this.prisma.module.findUnique({
            where: { key: dto.key },
        });

        if (existing) {
            throw new BadRequestException(`Feature '${dto.key}' already exists`);
        }

        return this.prisma.module.create({
            data: { key: dto.key },
        });
    }

    async findAll() {
        return this.prisma.module.findMany({
            orderBy: { key: 'asc' }
        });
    }

    async enableFeature(dto: ManageSchoolFeatureDto) {
        // Check if school and module exist
        const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
        if (!school) throw new NotFoundException('School not found');

        const moduleRef = await this.prisma.module.findUnique({ where: { id: dto.moduleId } });
        if (!moduleRef) throw new NotFoundException('Module not found');

        // Upsert SchoolModule
        return this.prisma.schoolModule.upsert({
            where: {
                schoolId_moduleId: {
                    schoolId: dto.schoolId,
                    moduleId: dto.moduleId,
                },
            },
            update: { enabled: true },
            create: {
                schoolId: dto.schoolId,
                moduleId: dto.moduleId,
                enabled: true,
            },
        });
    }

    async disableFeature(dto: ManageSchoolFeatureDto) {
        try {
            return await this.prisma.schoolModule.update({
                where: {
                    schoolId_moduleId: {
                        schoolId: dto.schoolId,
                        moduleId: dto.moduleId,
                    },
                },
                data: { enabled: false },
            });
        } catch (error) {
            if (error.code === 'P2025') {
                throw new NotFoundException('Feature was not assigned to this school');
            }
            throw error;
        }
    }
}
