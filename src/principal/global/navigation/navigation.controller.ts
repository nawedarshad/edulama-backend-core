import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Request, UseGuards } from '@nestjs/common';
import { NavigationService } from './navigation.service';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Principal - Website Navigation')
@ApiBearerAuth()
@Controller('principal/navigation')
@UseGuards(PrincipalAuthGuard)
export class NavigationController {
    constructor(private readonly navigationService: NavigationService) {}

    @ApiOperation({ summary: 'Get all web menus' })
    @Get()
    getMenus(@Request() req) {
        return this.navigationService.getMenus(req.user.schoolId);
    }

    @ApiOperation({ summary: 'Create a new web menu' })
    @Post()
    createMenu(@Request() req, @Body() data: { name: string; location: string }) {
        return this.navigationService.createMenu(req.user.schoolId, data);
    }

    @ApiOperation({ summary: 'Update a web menu and its items' })
    @Put(':id')
    updateMenu(
        @Request() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() data: any
    ) {
        return this.navigationService.updateMenu(req.user.schoolId, id, data);
    }

    @ApiOperation({ summary: 'Delete a web menu' })
    @Delete(':id')
    deleteMenu(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.navigationService.deleteMenu(req.user.schoolId, id);
    }
}
