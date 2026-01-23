import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { PrincipalLeaveTypeService } from './leave-type.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { UserAuthGuard } from '../../common/guards/user.guard';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@Controller('principal/leave-types')
@UseGuards(PrincipalAuthGuard)
export class PrincipalLeaveTypeController {
    constructor(private readonly leaveTypeService: PrincipalLeaveTypeService) { }

    @Post()
    create(@Request() req, @Body() dto: CreateLeaveTypeDto) {
        return this.leaveTypeService.create(req.user.schoolId, dto);
    }

    @Get()
    findAll(@Request() req) {
        return this.leaveTypeService.findAll(req.user.schoolId);
    }

    @Get(':id')
    findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveTypeService.findOne(req.user.schoolId, id);
    }

    @Patch(':id')
    update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeaveTypeDto) {
        return this.leaveTypeService.update(req.user.schoolId, id, dto);
    }

    @Delete(':id')
    remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.leaveTypeService.remove(req.user.schoolId, id);
    }
}
