import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, Patch, ParseIntPipe } from '@nestjs/common';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';
import { ModuleGuard } from '../../../common/guards/module.guard';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import type { AuthUserPayload } from '../../../common/decorators/get-user.decorator';
import { AllocationService } from './allocation.service';
import { CreateAllocationDto, UpdateAllocationDto, AllocationFilterDto } from './dto/allocation.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Principal - Subject Allocation')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('SUBJECTS')
@Controller('principal/allocation')
export class AllocationController {
    constructor(private allocationService: AllocationService) { }

    @Post()
    @ApiOperation({ summary: 'Assign a teacher to a subject for a class/section' })
    assignTeacher(
        @GetUser() user: AuthUserPayload,
        @Body() dto: CreateAllocationDto,
    ) {
        return this.allocationService.assignTeacher(user.schoolId, dto, user.id);
    }

    @Get('suggestions')
    @ApiOperation({ summary: 'Get smart suggestions for teacher allocation' })
    getSuggestions(
        @GetUser() user: AuthUserPayload,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('subjectId', ParseIntPipe) subjectId: number,
        @Query('sectionId', new ParseIntPipe({ optional: true })) sectionId?: number,
    ) {
        return this.allocationService.getSmartSuggestions(user.schoolId, classId, subjectId, sectionId);
    }

    @Get()
    @ApiOperation({ summary: 'List all allocations with filters' })
    findAll(
        @GetUser() user: AuthUserPayload,
        @Query() filters: AllocationFilterDto,
    ) {
        return this.allocationService.findAll(user.schoolId, filters);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an existing assignment' })
    updateAssignment(
        @GetUser() user: AuthUserPayload,
        @Param('id', ParseIntPipe) assignmentId: number,
        @Body() dto: UpdateAllocationDto,
    ) {
        return this.allocationService.updateAssignment(user.schoolId, assignmentId, dto, user.id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Remove a teacher allocation' })
    removeAssignment(
        @GetUser() user: AuthUserPayload,
        @Param('id', ParseIntPipe) assignmentId: number,
    ) {
        return this.allocationService.removeAssignment(user.schoolId, assignmentId, user.id);
    }
}
