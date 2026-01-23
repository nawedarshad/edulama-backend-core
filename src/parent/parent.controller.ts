import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../common/guards/user.guard';
import { ParentService } from './parent.service';

@ApiTags('Parent - General')
@ApiBearerAuth()
@Controller('parent')
@UseGuards(UserAuthGuard)
export class ParentController {
    constructor(private readonly parentService: ParentService) { }

    @ApiOperation({ summary: 'Get all children linked to the logged-in parent' })
    @Get('children')
    getChildren(@Request() req) {
        const schoolId = req.user.schoolId;
        const parentUserId = req.user.id;
        return this.parentService.getChildren(schoolId, parentUserId);
    }

    @ApiOperation({ summary: 'Get all children (Alias)' })
    @Get('students')
    getStudents(@Request() req) {
        return this.getChildren(req);
    }
}
