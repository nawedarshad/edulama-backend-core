import {
    Controller,
    Get,
    Put,
    Body,
    Param,
    ParseIntPipe
} from '@nestjs/common';
import { SaaSAdminService } from './saas-admin.service';

@Controller('api/admin/schools/:schoolId/modules')
export class SaaSAdminFeaturesController {
    constructor(private readonly saasAdminService: SaaSAdminService) { }

    @Get()
    findAll(@Param('schoolId', ParseIntPipe) schoolId: number) {
        return this.saasAdminService.getSchoolModules(schoolId);
    }

    @Put()
    update(
        @Param('schoolId', ParseIntPipe) schoolId: number,
        @Body() modules: { moduleId: number; enabled: boolean }[]
    ) {
        return this.saasAdminService.updateSchoolModules(schoolId, modules);
    }
}
