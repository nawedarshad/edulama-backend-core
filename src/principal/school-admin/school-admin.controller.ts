import { Controller, Post, Get, Patch, Delete, Body, Param, Req, ParseIntPipe, UseGuards } from '@nestjs/common';
import { SchoolAdminService } from './school-admin.service';
import { CreateSchoolAdminDto } from './dto/create-school-admin.dto';
import { UpdateSchoolAdminDto } from './dto/update-school-admin.dto';
import { SchoolAdminPermission } from './school-admin-permissions.enum';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Principal - School Admin')
@ApiBearerAuth()
@Controller('principal/school-admin')
@UseGuards(PrincipalAuthGuard)
export class SchoolAdminController {
    constructor(private readonly schoolAdminService: SchoolAdminService) { }

    @Get('permissions')
    getPermissions() {
        return Object.values(SchoolAdminPermission);
    }

    @Post()
    create(@Req() req, @Body() dto: CreateSchoolAdminDto) {
        const schoolId = req.user.schoolId;
        return this.schoolAdminService.create(schoolId, dto);
    }

    @Get()
    findAll(@Req() req) {
        const schoolId = req.user.schoolId;
        return this.schoolAdminService.findAll(schoolId);
    }

    @Get(':id')
    findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.schoolAdminService.findOne(schoolId, id);
    }

    @Patch(':id')
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSchoolAdminDto) {
        const schoolId = req.user.schoolId;
        return this.schoolAdminService.update(schoolId, id, dto);
    }

    @Delete(':id')
    remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.schoolAdminService.remove(schoolId, id);
    }
}
