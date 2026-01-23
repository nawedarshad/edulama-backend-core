import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, ParseIntPipe, Patch } from '@nestjs/common';
import { SubstitutionService } from './substitution.service';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';
import { UpdateSubstitutionDto } from './dto/update-substitution.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import type { User } from '@prisma/client';

@UseGuards(PrincipalAuthGuard)
@Controller('principal/substitution')
export class SubstitutionController {
    constructor(private service: SubstitutionService) { }

    @Get('absent-teachers')
    getAbsentTeachers(
        @GetUser() user: User,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
    ) {
        return this.service.getAbsentTeachers(user.schoolId, academicYearId, date);
    }

    @Get('impacted-classes')
    getImpactedClasses(
        @GetUser() user: User,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
    ) {
        return this.service.getImpactedClasses(user.schoolId, academicYearId, date);
    }

    @Get('available-teachers')
    getAvailableTeachers(
        @GetUser() user: User,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
        @Query('periodId', ParseIntPipe) periodId: number,
    ) {
        return this.service.getAvailableTeachers(user.schoolId, academicYearId, date, periodId);
    }

    @Post()
    createSubstitution(
        @GetUser() user: User,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Body() dto: CreateSubstitutionDto,
    ) {
        return this.service.createSubstitution(user.id, user.schoolId, academicYearId, dto);
    }

    @Patch(':id')
    updateSubstitution(
        @GetUser() user: User,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateSubstitutionDto,
    ) {
        return this.service.updateSubstitution(user.schoolId, id, dto);
    }

    @Get('teacher-history')
    getTeacherHistory(
        @GetUser() user: User,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('teacherId', ParseIntPipe) teacherId: number,
        @Query('date') date?: string,
    ) {
        return this.service.getTeacherSubstitutionHistory(user.schoolId, teacherId, academicYearId, date);
    }

    @Get()
    getSubstitutions(
        @GetUser() user: User,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date?: string,
    ) {
        return this.service.getSubstitutions(user.schoolId, academicYearId, date);
    }

    @Delete(':id')
    deleteSubstitution(
        @GetUser() user: User,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.deleteSubstitution(user.schoolId, id);
    }
}
