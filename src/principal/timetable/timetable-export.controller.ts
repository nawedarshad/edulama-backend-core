import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { TimetableExportService } from './timetable-export.service';

@ApiTags('Principal - Timetable - Export')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard)
@Controller('principal/timetable/export')
export class TimetableExportController {
    constructor(private readonly exportService: TimetableExportService) { }

    @Get('section/:sectionId/pdf')
    @ApiOperation({ summary: 'Export section timetable as PDF', description: 'Generates a downloadable PDF file of the weekly timetable for a specific section.' })
    @ApiParam({ name: 'sectionId', description: 'Section ID' })
    @ApiResponse({ status: 200, description: 'PDF file stream.' })
    async exportSectionPDF(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
        @Res() res: Response,
    ) {
        const buffer = await this.exportService.exportSectionPDF(schoolId, academicYearId, sectionId);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="timetable-section-${sectionId}.pdf"`);
        res.send(buffer);
    }

    @Get('teacher/:teacherId/pdf')
    @ApiOperation({ summary: 'Export teacher timetable as PDF', description: 'Generates a downloadable PDF file of the weekly timetable for a specific teacher.' })
    @ApiParam({ name: 'teacherId', description: 'Teacher Profile ID' })
    @ApiResponse({ status: 200, description: 'PDF file stream.' })
    async exportTeacherPDF(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('teacherId', ParseIntPipe) teacherId: number,
        @Res() res: Response,
    ) {
        const buffer = await this.exportService.exportTeacherPDF(schoolId, academicYearId, teacherId);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="timetable-teacher-${teacherId}.pdf"`);
        res.send(buffer);
    }

    @Get('section/:sectionId/excel')
    @ApiOperation({ summary: 'Export section timetable as Excel', description: 'Generates an Excel (.xlsx) file of the weekly timetable for a specific section.' })
    @ApiParam({ name: 'sectionId', description: 'Section ID' })
    @ApiResponse({ status: 200, description: 'Excel file stream.' })
    async exportSectionExcel(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number,
        @Res() res: Response,
    ) {
        const buffer = await this.exportService.exportSectionExcel(schoolId, academicYearId, sectionId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="timetable-section-${sectionId}.xlsx"`);
        res.send(buffer);
    }

    @Get('teacher/:teacherId/excel')
    @ApiOperation({ summary: 'Export teacher timetable as Excel', description: 'Generates an Excel (.xlsx) file of the weekly timetable for a specific teacher.' })
    @ApiParam({ name: 'teacherId', description: 'Teacher Profile ID' })
    @ApiResponse({ status: 200, description: 'Excel file stream.' })
    async exportTeacherExcel(
        @GetUser('schoolId') schoolId: number,
        @GetUser('academicYearId') academicYearId: number,
        @Param('teacherId', ParseIntPipe) teacherId: number,
        @Res() res: Response,
    ) {
        const buffer = await this.exportService.exportTeacherExcel(schoolId, academicYearId, teacherId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="timetable-teacher-${teacherId}.xlsx"`);
        res.send(buffer);
    }
}
