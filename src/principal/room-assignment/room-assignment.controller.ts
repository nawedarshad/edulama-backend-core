import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { RoomAssignmentService } from './room-assignment.service';
import { CreateRoomAssignmentDto } from './dto/create-room-assignment.dto';
import { UpdateRoomAssignmentDto } from './dto/update-room-assignment.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { Audit } from '../../common/audit/audit.decorator';

@Controller('principal/room-assignments')
@UseGuards(PrincipalAuthGuard)
@Audit('RoomAssignment')
export class RoomAssignmentController {
    constructor(private readonly roomAssignmentService: RoomAssignmentService) { }

    @Post()
    create(@Req() req, @Body() createDto: CreateRoomAssignmentDto) {
        return this.roomAssignmentService.create(req.user.schoolId, createDto);
    }

    @Get()
    findAll(@Req() req) {
        return this.roomAssignmentService.findAll(req.user.schoolId);
    }

    @Get(':id')
    findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.roomAssignmentService.findOne(req.user.schoolId, id);
    }

    @Patch(':id')
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateRoomAssignmentDto) {
        return this.roomAssignmentService.update(req.user.schoolId, id, updateDto);
    }

    @Delete(':id')
    remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.roomAssignmentService.remove(req.user.schoolId, id);
    }
}
