import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { BulkCreateTeacherDto } from './dto/bulk-create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { Audit } from '../../common/audit/audit.decorator';

@Controller('principal/teachers')
@UseGuards(PrincipalAuthGuard)
@Audit('Teacher')
export class TeacherController {
    constructor(private readonly teacherService: TeacherService) { }

    @Post()
    create(@Req() req, @Body() createDto: CreateTeacherDto) {
        return this.teacherService.create(req.user.schoolId, createDto);
    }

    @Post('bulk')
    bulkCreate(@Req() req, @Body() bulkDto: BulkCreateTeacherDto) {
        return this.teacherService.bulkCreate(req.user.schoolId, bulkDto);
    }

    @Get()
    findAll(@Req() req) {
        return this.teacherService.findAll(req.user.schoolId);
    }

    @Get(':id')
    findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.teacherService.findOne(req.user.schoolId, id);
    }

    @Patch(':id')
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateTeacherDto) {
        return this.teacherService.update(req.user.schoolId, id, updateDto);
    }

    @Delete(':id')
    remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.teacherService.remove(req.user.schoolId, id);
    }
}
