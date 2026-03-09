import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PublicSchoolService } from './public-school.service';

@ApiTags('Public School Information')
@Controller('public-school')
export class PublicSchoolController {
    constructor(private readonly publicSchoolService: PublicSchoolService) { }

    @Get(':subdomain/syllabus')
    @ApiOperation({ summary: 'Get all classes, subjects, and syllabus for a school landing page' })
    @ApiParam({ name: 'subdomain', description: 'The school subdomain' })
    getSyllabus(@Param('subdomain') subdomain: string) {
        return this.publicSchoolService.getSyllabusBySubdomain(subdomain);
    }
}
