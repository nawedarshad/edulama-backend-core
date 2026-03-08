import { Body, Controller, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { SchoolSettingsService } from './school-settings.service';
import { UpdateSchoolSettingsDto } from './dto/update-school-settings.dto';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../prisma/prisma.service';

@ApiTags('Principal - Global Settings')
@ApiBearerAuth()
@Controller('principal/global/settings')
@UseGuards(PrincipalAuthGuard)
export class SchoolSettingsController {
    constructor(
        private readonly settingsService: SchoolSettingsService,
        private readonly prisma: PrismaService,
    ) { }

    @ApiOperation({ summary: 'Get school type info (for capability detection)' })
    @Get('school-info')
    async getSchoolInfo(@Request() req) {
        const schoolId = req.user.schoolId;
        const school = await this.prisma.school.findUnique({
            where: { id: schoolId },
            select: { id: true, name: true, type: true, subdomain: true },
        });
        return school;
    }

    @ApiOperation({ summary: 'Get current school settings', description: 'Retrieves settings including branding, address, and academic config.' })
    @Get()
    getSettings(@Request() req) {
        const schoolId = req.user.schoolId;
        return this.settingsService.getSettings(schoolId);
    }

    @ApiOperation({ summary: 'Update school settings', description: 'Updates settings. Use empty strings to unset optional fields.' })
    @Patch()
    updateSettings(@Request() req, @Body() dto: UpdateSchoolSettingsDto) {
        const schoolId = req.user.schoolId;
        const userId = req.user.id;
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        return this.settingsService.updateSettings(schoolId, userId, dto, ip);
    }
}
