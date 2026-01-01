import { Controller, Get, Post, Body, Param, Patch, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { AcademicYearService } from './academic-year.service';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@UseGuards(PrincipalAuthGuard)
@Controller('principal/academic-years')
export class AcademicYearController {
    constructor(private service: AcademicYearService) { }

    @Get('active')
    getActive(@Req() req) {
        return this.service.findActive(req.user.schoolId);
    }

    @Get()
    findAll(@Req() req) {
        return this.service.findAll(req.user.schoolId);
    }

    @Post()
    create(@Req() req, @Body() dto: CreateAcademicYearDto) {
        return this.service.create(req.user.schoolId, dto);
    }

    @Patch(':id')
    update(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateAcademicYearDto,
    ) {
        return this.service.update(req.user.schoolId, id, dto);
    }
}
