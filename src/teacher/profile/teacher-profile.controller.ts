import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { TeacherProfileService } from './teacher-profile.service';

@ApiTags('Teacher - Profile')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('teacher/profile')
export class TeacherProfileController {
    constructor(private readonly profileService: TeacherProfileService) { }

    @Get()
    @ApiOperation({ summary: 'Get full profile of the logged-in teacher' })
    getMyProfile(@Request() req) {
        return this.profileService.findMyProfile(req.user.schoolId, req.user.id);
    }
}
