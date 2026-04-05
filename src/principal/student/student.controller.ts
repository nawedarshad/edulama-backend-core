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
import { StudentBulkActionDto } from './dto/bulk-action.dto';
import { BulkStudentUploadDto } from './dto/bulk-upload-student.dto';
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
        if (headerYearId) {
            const id = parseInt(headerYearId);
            if (!isNaN(id)) {
                const year = await this.prisma.academicYear.findFirst({
                    where: { id, schoolId }
                });
                if (year) return id;
            }
        }

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
        return this.studentService.create(req.user.schoolId, yearId, dto, req.user.id);
    }

    @Post('bulk-upload')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Bulk upload students' })
    @ApiResponse({ status: 201, description: 'Bulk upload completed.' })
    async bulkUpload(
        @Request() req,
        @Body() dto: BulkStudentUploadDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.studentService.bulkUpload(req.user.schoolId, yearId, dto, req.user.id);
    }

    @Post('validate-bulk')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Pre-validate bulk student upload data' })
    @ApiResponse({ status: 200, description: 'Validation results.' })
    async validateBulk(
        @Request() req,
        @Body() dto: BulkStudentUploadDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        const yearId = await this.getActiveAcademicYear(req.user.schoolId, yearIdHeader);
        return this.studentService.validateBulk(req.user.schoolId, yearId, dto);
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

    @Get('lookup-parent')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Look up if a user with this email or phone already exists in the system (for smart parent linking)' })
    @ApiQuery({ name: 'contact', required: true, description: 'The email address or phone number to look up' })
    @ApiResponse({ status: 200, description: 'Returns user info if found, or { exists: false } if not.' })
    lookupParent(
        @Request() req,
        @Query('contact') contact: string,
    ) {
        return this.studentService.lookupParentByContact(contact, req.user.schoolId);
    }

    @Get(':id')
    @UseGuards(PrincipalOrTeacherGuard)
    @ApiOperation({ summary: 'Get student details' })
    @ApiResponse({ status: 200, description: 'Student details.' })
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.studentService.findOne(id, req.user.schoolId);
    }

    @Patch('bulk-actions')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Perform bulk actions on students (Promote, Deactivate, Set House)' })
    @ApiResponse({ status: 200, description: 'Bulk action performed successfully.' })
    bulkActions(
        @Request() req,
        @Body() dto: StudentBulkActionDto,
        @Headers('x-academic-year-id') yearIdHeader?: string,
    ) {
        return this.studentService.bulkActions(req.user.schoolId, dto, req.user.id);
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
        return this.studentService.update(id, req.user.schoolId, dto, req.user.id);
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
        return this.studentService.markAsLeft(schoolId, id, dto, req.user.id);
    }

    @Delete(':id')
    @UseGuards(PrincipalAuthGuard) // Write: Principal Only
    @ApiOperation({ summary: 'Delete a student' })
    @ApiResponse({ status: 200, description: 'The student has been successfully deleted.' })
    @ApiResponse({ status: 404, description: 'Student not found.' })
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.studentService.remove(id, req.user.schoolId, req.user.id);
    }

    // ==========================
    // DOCUMENTS
    // ==========================
    
    @Post(':id/documents/presign')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Generate a presigned upload URL for a student document' })
    async generatePresignedUrl(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { fileName: string; fileType: string }
    ) {
        return this.studentService.generateDocumentPresignedUrl(req.user.schoolId, id, body.fileName, body.fileType);
    }

    @Post(':id/documents')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Save student document metadata after upload' })
    async saveDocument(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { name: string; type: string; size: number; customKey: string }
    ) {
        return this.studentService.saveDocument(req.user.schoolId, id, body.name, body.type, body.size, body.customKey, req.user.id);
    }

    @Delete(':id/documents/:docId')
    @UseGuards(PrincipalAuthGuard)
    @ApiOperation({ summary: 'Delete a student document' })
    async deleteDocument(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('docId', ParseIntPipe) docId: number
    ) {
        return this.studentService.deleteDocument(req.user.schoolId, id, docId, req.user.id);
    }
}
