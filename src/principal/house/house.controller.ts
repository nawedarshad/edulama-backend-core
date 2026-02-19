import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { HouseService } from './house.service';
import { CreateHouseDto } from './dto/create-house.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { RequiredModule } from '../../common/decorators/required-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

@ApiTags('House Management')
@ApiBearerAuth()
@Controller('principal/houses')
@UseGuards(PrincipalAuthGuard, ModuleGuard)
@RequiredModule('HOUSES')
export class HouseController {
    constructor(private readonly houseService: HouseService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new house' })
    @ApiResponse({ status: 201, description: 'The house has been successfully created.' })
    @ApiResponse({ status: 409, description: 'House with this name already exists.' })
    create(@GetUser('schoolId') schoolId: number, @Body() dto: CreateHouseDto) {
        return this.houseService.create(schoolId, dto);
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

    @Patch(':id')
    @ApiOperation({ summary: 'Update a house' })
    @ApiResponse({ status: 200, description: 'The house has been successfully updated.' })
    @ApiResponse({ status: 404, description: 'House not found.' })
    @ApiResponse({ status: 409, description: 'House name conflict.' })
    update(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHouseDto,
    ) {
        return this.houseService.update(schoolId, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a house' })
    @ApiResponse({ status: 200, description: 'The house has been successfully deleted.' })
    @ApiResponse({ status: 404, description: 'House not found.' })
    remove(
        @GetUser('schoolId') schoolId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.houseService.remove(schoolId, id);
    }
}
