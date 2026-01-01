import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SchoolService } from './school.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { AdminAuthGuard } from '../../common/guards/admin.guard';

@Controller('admin/school')
@UseGuards(AdminAuthGuard)
export class SchoolController {
    constructor(private readonly schoolService: SchoolService) { }

    @Post()
    async createSchool(@Body() createSchoolDto: CreateSchoolDto) {
        return this.schoolService.createSchool(createSchoolDto);
    }

    @Get()
    async getSchools() {
        return this.schoolService.getSchools();
    }

    @Get(':id')
    async findOne(@Param('id', ParseIntPipe) id: number) {
        return this.schoolService.findOne(id);
    }

    @Patch(':id')
    async update(@Param('id', ParseIntPipe) id: number, @Body() updateSchoolDto: UpdateSchoolDto) {
        return this.schoolService.update(id, updateSchoolDto);
    }

    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number) {
        return this.schoolService.remove(id);
    }
}
