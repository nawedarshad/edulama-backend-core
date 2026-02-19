
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { ManageSchoolFeatureDto } from './dto/manage-school-feature.dto';
import { AdminAuthGuard } from '../../common/guards/admin.guard';

@Controller('api/admin/features')
@UseGuards(AdminAuthGuard)
export class FeaturesController {
    constructor(private readonly featuresService: FeaturesService) { }

    @Post()
    async createFeature(@Body() dto: CreateFeatureDto) {
        return this.featuresService.createFeature(dto);
    }

    @Get()
    async findAll() {
        return this.featuresService.findAll();
    }

    @Post('enable')
    async enableFeature(@Body() dto: ManageSchoolFeatureDto) {
        return this.featuresService.enableFeature(dto);
    }

    @Post('disable')
    async disableFeature(@Body() dto: ManageSchoolFeatureDto) {
        return this.featuresService.disableFeature(dto);
    }
}
