import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, Put, Patch, ParseIntPipe, Req } from '@nestjs/common';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';
import { AllocationService } from './allocation.service';
import { CreateAllocationDto, UpdateAllocationDto, AllocationFilterDto } from './dto/allocation.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Principal - Subject Allocation')
@UseGuards(PrincipalAuthGuard)
@Controller('principal/allocation')
export class AllocationController {
    constructor(private allocationService: AllocationService) { }

    @Post()
    @ApiOperation({ summary: 'Assign a teacher to a subject for a class/section' })
    assignTeacher(
        @Req() req,
        @Body() dto: CreateAllocationDto,
    ) {
        return this.allocationService.assignTeacher(req.user.schoolId, dto);
    }

    @Get()
    @ApiOperation({ summary: 'List all allocations with filters' })
    findAll(
        @Req() req,
        @Query() filters: AllocationFilterDto,
    ) {
        return this.allocationService.findAll(req.user.schoolId, filters);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update an existing assignment' })
    updateAssignment(
        @Req() req,
        @Param('id', ParseIntPipe) assignmentId: number,
        @Body() dto: UpdateAllocationDto,
    ) {
        return this.allocationService.updateAssignment(req.user.schoolId, assignmentId, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Remove a teacher allocation' })
    removeAssignment(
        @Req() req,
        @Param('id', ParseIntPipe) assignmentId: number,
    ) {
        return this.allocationService.removeAssignment(req.user.schoolId, assignmentId);
    }

    @Get('suggestions')
    @ApiOperation({ summary: 'Get smart suggestions for teacher allocation' })
    getSuggestions(
        @Req() req,
        @Query('classId', ParseIntPipe) classId: number,
        @Query('subjectId', ParseIntPipe) subjectId: number,
        @Query('sectionId') sectionId?: string,
    ) {
        const secId = sectionId ? parseInt(sectionId) : undefined;
        return this.allocationService.getSmartSuggestions(req.user.schoolId, classId, subjectId, secId);
    }
}
