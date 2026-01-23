import {
    Controller,
    Post,
    Patch,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { TimetableWorkflowService } from './timetable-workflow.service';
import { SwapEntriesDto } from './dto/swap-entries.dto';
import { MoveEntryDto } from './dto/move-entry.dto';

@ApiTags('Principal - Timetable - Workflow')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard)
@Controller('principal/timetable/workflow')
export class TimetableWorkflowController {
    constructor(private readonly workflowService: TimetableWorkflowService) { }

    @Post('swap')
    @ApiOperation({ summary: 'Swap two timetable entries', description: 'Exchanges the time slots of two existing timetable entries. Validates conflicts for both moves.' })
    @ApiResponse({ status: 201, description: 'Entries swapped successfully.' })
    @ApiResponse({ status: 400, description: 'One or both entries are locked.' })
    @ApiResponse({ status: 409, description: 'Conflict detected (e.g., teacher double-booking).' })
    swapEntries(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body() dto: SwapEntriesDto,
    ) {
        return this.workflowService.swapEntries(schoolId, academicYearId, dto);
    }

    @Post('move')
    @ApiOperation({ summary: 'Move a timetable entry', description: 'Moves an entry to a new time slot. Validates availability of the new slot, teacher, and room.' })
    @ApiResponse({ status: 201, description: 'Entry moved successfully.' })
    @ApiResponse({ status: 409, description: 'Target slot, teacher, or room is busy.' })
    moveEntry(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Body() dto: MoveEntryDto,
    ) {
        return this.workflowService.moveEntry(schoolId, academicYearId, dto);
    }

    @Patch('entries/:id/lock')
    @ApiOperation({ summary: 'Lock/Unlock a single entry', description: 'Prevents or allows future modifications to a specific timetable entry.' })
    @ApiParam({ name: 'id', description: 'Timetable Entry ID' })
    @ApiBody({ schema: { type: 'object', properties: { isLocked: { type: 'boolean' } } } })
    @ApiResponse({ status: 200, description: 'Entry lock status updated.' })
    lockEntry(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) entryId: number,
        @Body('isLocked') isLocked: boolean,
    ) {
        return this.workflowService.lockEntry(schoolId, entryId, isLocked);
    }

    @Post('sections/:sectionId/publish')
    @ApiOperation({ summary: 'Publish section timetable', description: 'Changes all DRAFT entries for a section to PUBLISHED state.' })
    @ApiParam({ name: 'sectionId', description: 'Section ID' })
    @ApiResponse({ status: 201, description: 'Timetable published.' })
    publishTimetable(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @GetUser('userId') userId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
    ) {
        return this.workflowService.publishTimetable(schoolId, academicYearId, sectionId, userId);
    }

    @Post('publish-all')
    @ApiOperation({ summary: 'Publish ALL timetables', description: 'Changes all non-locked entries in the academic year to PUBLISHED state.' })
    @ApiResponse({ status: 201, description: 'All timetables published.' })
    publishAllTimetable(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @GetUser('userId') userId: number,
    ) {
        return this.workflowService.publishAllTimetable(schoolId, academicYearId, userId);
    }

    @Post('sections/:sectionId/lock')
    @ApiOperation({ summary: 'Lock section timetable', description: 'Locks all entries for a section, preventing further edits.' })
    @ApiParam({ name: 'sectionId', description: 'Section ID' })
    @ApiResponse({ status: 201, description: 'Timetable locked.' })
    lockTimetable(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
    ) {
        return this.workflowService.lockTimetable(schoolId, academicYearId, sectionId);
    }

    @Post('sections/:sectionId/unlock')
    @ApiOperation({ summary: 'Unlock section timetable', description: 'Unlocks a previously locked timetable, reverting status to PUBLISHED.' })
    @ApiParam({ name: 'sectionId', description: 'Section ID' })
    @ApiResponse({ status: 201, description: 'Timetable unlocked.' })
    unlockTimetable(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
    ) {
        return this.workflowService.unlockTimetable(schoolId, academicYearId, sectionId);
    }
}
