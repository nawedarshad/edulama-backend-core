import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
    Headers,
    Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { PrincipalOrTeacherGuard } from '../../common/guards/principal-teacher.guard';
import { StudentService } from './student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { MarkStudentLeftDto } from './dto/mark-student-left.dto';
import { StudentFilterDto } from './dto/student-filter.dto';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Principal - Students')
@ApiBearerAuth()
@Controller('principal/students')
// @UseGuards(PrincipalAuthGuard) // Removed to apply per-method
export class StudentController {
    constructor(
        private readonly studentService: StudentService,
        private readonly prisma: PrismaService, // Direct access for quick year fetch or move to service
    ) { }

    private async getActiveAcademicYear(schoolId: number, headerYearId?: string): Promise<number> {
        if (headerYearId) return parseInt(headerYearId);

        // Default to ACTIVE
        const year = await this.prisma.academicYear.findFirst({
            where: { schoolId, status: 'ACTIVE' }
        });
        if (!year) {
            throw new Error('No active academic year found for this school.');
        }
        return year.id;
    }

    @Post()
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only
    @ApiOperation({ summary: 'Create a new student' })
    @ApiResponse({ status: 201, description: 'The student has been successfully created.', type: CreateStudentDto })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation failed or duplicates found.' })
    async create(
        @Request() req,
        @Body() dto: CreateStudentDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.studentService.create(req.user.schoolId, yearId, dto);
    }

    @Get()
    @UseGuards(PrincipalAuthGuard) // Read: Principal + Teacher
    @ApiOperation({ summary: 'Get all students with filters' })
    @ApiResponse({ status: 200, description: 'List of students.' })
    async findAll(
        @Request() req,
        @Query() filters: StudentFilterDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.studentService.findAll(req.user.schoolId, yearId, filters);
    }

    @Get('analytics')
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only (Analytics restricted)
    @ApiOperation({ summary: 'Get student analytics' })
    @ApiResponse({ status: 200, description: 'Student analytics data.' })
    async getAnalytics(
        @Request() req,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.studentService.getAnalytics(req.user.schoolId, yearId);
    }

    @Get(':id')
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only (Details restricted)
    @ApiOperation({ summary: 'Get a student by ID' })
    @ApiResponse({ status: 200, description: 'The student found.', type: CreateStudentDto })
    @ApiResponse({ status: 404, description: 'Student not found.' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        // We don't strictly need yearId to FIND by ID, but contextually ensures security
        return this.studentService.findOne(id, req.user.schoolId);
    }

    @Patch(':id')
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only
    @ApiOperation({ summary: 'Update a student' })
    @ApiResponse({ status: 200, description: 'The student has been successfully updated.' })
    @ApiResponse({ status: 404, description: 'Student not found.' })
    update(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateStudentDto,
    ) {
        return this.studentService.update(id, req.user.schoolId, dto);
    }

    @Patch(':id/leave')
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only
    @ApiOperation({ summary: 'Mark student as left (inactive)' })
    @ApiResponse({ status: 200, description: 'Student marked as left.' })
    @ApiResponse({ status: 404, description: 'Student not found.' })
    async markAsLeft(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: MarkStudentLeftDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.studentService.markAsLeft(schoolId, id, dto);
    }

    @Delete(':id')
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only
    @ApiOperation({ summary: 'Delete a student' })
    @ApiResponse({ status: 200, description: 'The student has been successfully deleted.' })
    @ApiResponse({ status: 404, description: 'Student not found.' })
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.studentService.remove(id, req.user.schoolId);
    }
}
