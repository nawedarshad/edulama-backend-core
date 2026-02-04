import { Controller, Get, UseGuards, Request, Headers, UnauthorizedException, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { TeacherStudentService } from './student.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Teacher - Students')
@ApiBearerAuth()
@Controller('teacher/students')
@UseGuards(UserAuthGuard)
export class TeacherStudentController {
    constructor(
        private readonly studentService: TeacherStudentService,
        private readonly prisma: PrismaService
    ) { }

    private async getActiveAcademicYear(schoolId: number, headerYearId?: string): Promise<number> {
        if (headerYearId) return parseInt(headerYearId);
        const year = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!year) throw new Error('No active academic year found');
        return year.id;
    }

    @Get()
    @ApiOperation({ summary: 'Get minimal student list for grievances' })
    @ApiResponse({ status: 200, description: 'Minimal student list (Name, Class, Section, Roll No)' })
    async findAll(
        @Request() req,
        @Headers('x-academic-year-id') yearIdHeader?: string,
        @Query('classId') classId?: string,
        @Query('sectionId') sectionId?: string,
    ) {
        // Strict Role Check: TEACHER ONLY
        if (req.user.role !== 'TEACHER') {
            throw new UnauthorizedException('Access denied. Teachers only.');
        }

        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.studentService.findAll(req.user.schoolId, yearId,
            classId ? parseInt(classId) : undefined,
            sectionId ? parseInt(sectionId) : undefined
        );
    }
}
