import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { StudentProfileService } from './student-profile.service';

@ApiTags('Student - Profile')
@ApiBearerAuth()
@Controller()
@UseGuards(UserAuthGuard)
export class StudentProfileController {
    constructor(private readonly studentProfileService: StudentProfileService) { }

    @ApiOperation({ summary: 'Get logged-in student profile' })
    @Get('student/profile')
    getStudentProfile(@Request() req) {
        return this.studentProfileService.getStudentProfile(req.user.id, req.user.schoolId);
    }

    @ApiOperation({ summary: 'Get a specific child profile for the parent' })
    @Get('parent/student/:id/profile')
    getChildProfile(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.studentProfileService.getChildProfileForParent(id, req.user.id);
    }
}
