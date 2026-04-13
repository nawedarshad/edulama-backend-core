import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { ManageSchoolFeatureDto } from './dto/manage-school-feature.dto';
import { AdminAuthGuard } from '../../common/guards/admin.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/features')
@UseGuards(AdminAuthGuard)
export class FeaturesController {
    constructor(private readonly featuresService: FeaturesService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new feature definition', description: 'Defines a new feature that can be enabled/disabled for schools.' })
    async createFeature(@Body() dto: CreateFeatureDto) {
        return this.featuresService.createFeature(dto);
    }

    @Get()
    @ApiOperation({ summary: 'List all features', description: 'Returns a list of all feature definitions on the platform.' })
    async findAll() {
        return this.featuresService.findAll();
    }

    @Post('enable')
    @ApiOperation({ summary: 'Enable feature for a school', description: 'Enables a specific feature for a specific school.' })
    async enableFeature(@Body() dto: ManageSchoolFeatureDto) {
        return this.featuresService.enableFeature(dto);
    }

    @Post('disable')
    @ApiOperation({ summary: 'Disable feature for a school', description: 'Disables a specific feature for a specific school.' })
    async disableFeature(@Body() dto: ManageSchoolFeatureDto) {
        return this.featuresService.disableFeature(dto);
    }
}
