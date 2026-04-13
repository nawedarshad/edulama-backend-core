import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SchoolService } from './school.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { AdminAuthGuard } from '../../common/guards/admin.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/school')
@UseGuards(AdminAuthGuard)
export class SchoolController {
    constructor(private readonly schoolService: SchoolService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new school', description: 'Registers a new school in the platform.' })
    @ApiResponse({ status: 201, description: 'School created successfully.' })
    async createSchool(@Body() createSchoolDto: CreateSchoolDto) {
        return this.schoolService.createSchool(createSchoolDto);
    }

    @Get()
    @ApiOperation({ summary: 'List all schools', description: 'Returns a list of all registered schools.' })
    async getSchools() {
        return this.schoolService.getSchools();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get school details', description: 'Returns details of a specific school by ID.' })
    async findOne(@Param('id', ParseIntPipe) id: number) {
        return this.schoolService.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update school', description: 'Updates school details.' })
    async update(@Param('id', ParseIntPipe) id: number, @Body() updateSchoolDto: UpdateSchoolDto) {
        return this.schoolService.update(id, updateSchoolDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete school', description: 'Removes a school from the platform.' })
    async remove(@Param('id', ParseIntPipe) id: number) {
        return this.schoolService.remove(id);
    }
}
