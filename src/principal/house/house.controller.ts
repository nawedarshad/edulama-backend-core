import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { HouseService } from './house.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

import { Audit } from '../../common/audit/audit.decorator';

@ApiTags('House Management')
@ApiBearerAuth()
@Controller('principal/houses')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('HOUSES')
@Audit('House Management')
export class HouseController {
    constructor(private readonly houseService: HouseService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new house' })
    @ApiResponse({ status: 201, description: 'The house has been successfully created.' })
    @ApiResponse({ status: 409, description: 'House with this name already exists.' })
    create(
        @GetUser('schoolId') schoolId: number, 
        @GetUser('id') userId: number,
        @Body() dto: CreateHouseDto
    ) {
        return this.houseService.create(schoolId, dto, userId);
    }
    
    @Get('stats')
    @ApiOperation({ summary: 'Get global house system statistics' })
    @ApiResponse({ status: 200, description: 'Returns participation and allocation metrics.' })
    getStats(@GetUser('schoolId') schoolId: number) {
        return this.houseService.getStats(schoolId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all houses' })
    @ApiResponse({ status: 200, description: 'Return all houses.' })
    findAll(@GetUser('schoolId') schoolId: number) {
        return this.houseService.findAll(schoolId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a house by id' })
    @ApiResponse({ status: 200, description: 'Return the house details.' })
    @ApiResponse({ status: 404, description: 'House not found.' })
    findOne(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.houseService.findOne(schoolId, id);
    }

    @Get(':id/students')
    @ApiOperation({ summary: 'Get paginated list of students in a house' })
    @ApiResponse({ status: 200, description: 'Returns paginated students.' })
    getHouseStudents(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
        @Query() queryDto: PaginationQueryDto // Make sure to add Query to imports
    ) {
        return this.houseService.getHouseStudents(schoolId, id, queryDto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a house' })
    @ApiResponse({ status: 200, description: 'The house has been successfully updated.' })
    @ApiResponse({ status: 404, description: 'House not found.' })
    @ApiResponse({ status: 409, description: 'House name conflict.' })
    update(
        @GetUser('schoolId') schoolId: number,
        @GetUser('id') userId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHouseDto,
    ) {
        return this.houseService.update(schoolId, id, dto, userId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a house' })
    @ApiResponse({ status: 200, description: 'The house has been successfully deleted.' })
    @ApiResponse({ status: 404, description: 'House not found.' })
    remove(
        @GetUser('schoolId') schoolId: number,
        @GetUser('id') userId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.houseService.remove(schoolId, id, userId);
    }
}
