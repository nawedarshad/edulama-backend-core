import { Controller, Get, Param, ParseIntPipe, Query, UseGuards, Req, Patch, Body } from '@nestjs/common';
import { AcademicGroupService } from './academic-group.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AcademicGroupType } from '@prisma/client';

@ApiTags('Academic Group')
@Controller('principal/academic-groups')
@UseGuards(PrincipalAuthGuard)
export class AcademicGroupController {
    constructor(private readonly groupService: AcademicGroupService) { }

    @Get()
    @ApiOperation({ summary: 'List all academic groups' })
    @ApiQuery({ name: 'type', required: false, enum: AcademicGroupType })
    @ApiResponse({ status: 200, description: 'Return all groups.' })
    async findAll(
        @Req() req,
        @Query('type') type?: AcademicGroupType,
    ) {
        const schoolId = req.user.schoolId;
        await this.groupService.syncSchoolGroups(schoolId);
        return this.groupService.findAll(schoolId, type);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get an academic group by id' })
    @ApiResponse({ status: 200, description: 'Return the group.' })
    async findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.groupService.findOne(schoolId, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an academic group' })
    @ApiResponse({ status: 200, description: 'The group has been successfully updated.' })
    async update(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() data: any,
    ) {
        const schoolId = req.user.schoolId;
        return this.groupService.update(schoolId, id, data);
    }
}
