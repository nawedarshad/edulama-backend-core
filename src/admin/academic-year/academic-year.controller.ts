
import { Controller, Get, Post, Put, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AcademicYearService } from './academic-year.service';
import { AdminCreateAcademicYearDto, AdminUpdateAcademicYearDto } from './dto/admin-academic-year.dto';
import { AdminAuthGuard } from '../../common/guards/admin.guard';

@Controller('admin/academic-years')
@UseGuards(AdminAuthGuard)
export class AcademicYearController {
    constructor(private readonly academicYearService: AcademicYearService) { }

    @Get()
    async findAll() {
        return this.academicYearService.findAll();
    }

    @Post()
    async create(@Body() dto: AdminCreateAcademicYearDto) {
        return this.academicYearService.create(dto);
    }

    @Put(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AdminUpdateAcademicYearDto
    ) {
        return this.academicYearService.update(id, dto);
    }
}
