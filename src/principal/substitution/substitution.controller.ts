import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Query,
    Param,
    UseGuards,
    ParseIntPipe,
    Patch,
} from '@nestjs/common';
import { SubstitutionService } from './substitution.service';
import { CreateSubstitutionDto } from './dto/create-substitution.dto';
import { UpdateSubstitutionDto } from './dto/update-substitution.dto';
import { GetSubstitutionsFilterDto } from './dto/get-substitutions-filter.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { AuthUserPayload } from '../../common/decorators/get-user.decorator';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('SUBSTITUTIONS')
@Controller('principal/substitution')
export class SubstitutionController {
    constructor(private readonly service: SubstitutionService) { }

    @Get('absent-teachers')
    getAbsentTeachers(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
    ) {
        return this.service.getAbsentTeachers(user.schoolId, academicYearId, date);
    }

    @Get('impacted-classes')
    getImpactedClasses(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
    ) {
        return this.service.getImpactedClasses(user.schoolId, academicYearId, date);
    }

    // Query param is `timeSlotId` (a TimeSlot.id) — NOT a TimePeriod.id
    @Get('available-teachers')
    getAvailableTeachers(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('date') date: string,
        @Query('timeSlotId', ParseIntPipe) timeSlotId: number,
    ) {
        return this.service.getAvailableTeachers(user.schoolId, academicYearId, date, timeSlotId);
    }

    @Post()
    createSubstitution(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Body() dto: CreateSubstitutionDto,
    ) {
        return this.service.createSubstitution(user.id, user.schoolId, academicYearId, dto);
    }

    @Patch(':id')
    updateSubstitution(
        @GetUser() user: AuthUserPayload,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateSubstitutionDto,
    ) {
        return this.service.updateSubstitution(user.schoolId, id, dto, user.id);
    }

    @Get('teacher-history')
    getTeacherHistory(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query('teacherId', ParseIntPipe) teacherId: number,
        @Query('date') date?: string,
    ) {
        return this.service.getTeacherSubstitutionHistory(user.schoolId, teacherId, academicYearId, date);
    }

    @Get()
    getSubstitutions(
        @GetUser() user: AuthUserPayload,
        @Query('academicYearId', ParseIntPipe) academicYearId: number,
        @Query() filter: GetSubstitutionsFilterDto,
    ) {
        return this.service.getSubstitutions(
            user.schoolId,
            academicYearId,
            filter.date,
            filter.page,
            filter.limit,
        );
    }

    @Delete(':id')
    deleteSubstitution(
        @GetUser() user: AuthUserPayload,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.deleteSubstitution(user.schoolId, id, user.id);
    }
}
