import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { CreateTeacherDto, CreateDocumentDto, CreateQualificationDto, CreateCertificationDto, CreateTrainingDto, CreateResponsibilityDto, CreateAppraisalDto } from './dto/create-teacher.dto';
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

    @Post(':id/documents')
    addDocument(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateDocumentDto) {
        return this.teacherService.addDocument(req.user.schoolId, id, dto);
    }

    @Delete(':id/documents/:docId')
    removeDocument(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('docId', ParseIntPipe) docId: number) {
        return this.teacherService.removeDocument(req.user.schoolId, id, docId);
    }

    @Post(':id/qualifications')
    addQualification(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateQualificationDto) {
        return this.teacherService.addQualification(req.user.schoolId, id, dto);
    }

    @Delete(':id/qualifications/:qualId')
    removeQualification(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('qualId', ParseIntPipe) qualId: number) {
        return this.teacherService.removeQualification(req.user.schoolId, id, qualId);
    }

    @Post(':id/skills')
    addSkill(@Req() req, @Param('id', ParseIntPipe) id: number, @Body('name') name: string) {
        if (!name) throw new BadRequestException('Skill name is required');
        return this.teacherService.addSkill(req.user.schoolId, id, name);
    }

    @Delete(':id/skills/:skillId')
    removeSkill(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('skillId', ParseIntPipe) skillId: number) {
        return this.teacherService.removeSkill(req.user.schoolId, id, skillId);
    }

    @Post(':id/certifications')
    addCertification(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateCertificationDto) {
        return this.teacherService.addCertification(req.user.schoolId, id, dto);
    }

    @Delete(':id/certifications/:certId')
    removeCertification(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('certId', ParseIntPipe) certId: number) {
        return this.teacherService.removeCertification(req.user.schoolId, id, certId);
    }

    @Post(':id/trainings')
    addTraining(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateTrainingDto) {
        return this.teacherService.addTraining(req.user.schoolId, id, dto);
    }

    @Delete(':id/trainings/:trainingId')
    removeTraining(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('trainingId', ParseIntPipe) trainingId: number) {
        return this.teacherService.removeTraining(req.user.schoolId, id, trainingId);
    }

    @Post(':id/appraisals')
    addAppraisal(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateAppraisalDto) {
        return this.teacherService.addAppraisal(req.user.schoolId, id, dto);
    }

    @Delete(':id/appraisals/:appraisalId')
    removeAppraisal(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('appraisalId', ParseIntPipe) appraisalId: number) {
        return this.teacherService.removeAppraisal(req.user.schoolId, id, appraisalId);
    }

    @Post(':id/responsibilities')
    addResponsibility(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateResponsibilityDto) {
        return this.teacherService.addResponsibility(req.user.schoolId, id, dto);
    }

    @Delete(':id/responsibilities/:respId')
    removeResponsibility(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('respId', ParseIntPipe) respId: number) {
        return this.teacherService.removeResponsibility(req.user.schoolId, id, respId);
    }

    @Post(':id/preferred-subjects')
    addPreferredSubject(@Req() req, @Param('id', ParseIntPipe) id: number, @Body('subjectId', ParseIntPipe) subjectId: number) {
        if (!subjectId) throw new BadRequestException('Subject ID is required');
        return this.teacherService.addPreferredSubject(req.user.schoolId, id, subjectId);
    }

    @Delete(':id/preferred-subjects/:subjectId')
    removePreferredSubject(@Req() req, @Param('id', ParseIntPipe) id: number, @Param('subjectId', ParseIntPipe) subjectId: number) {
        return this.teacherService.removePreferredSubject(req.user.schoolId, id, subjectId);
    }
}
