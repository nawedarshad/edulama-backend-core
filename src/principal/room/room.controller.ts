
import {
    Body,
    Controller,
    Get,
    Post,
    Query,
    Req,
    UseGuards,
    UsePipes,
    ValidationPipe,
    Patch,
    Delete,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { RoomService } from './room.service';
import { Audit } from '../../common/audit/audit.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { GetRoomsDto } from './dto/get-rooms.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { AssignRoomDto } from './dto/assign-room.dto';
import { BulkCreateRoomDto } from './dto/bulk-create-room.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Room')
@Controller('principal/rooms')
@UseGuards(PrincipalAuthGuard)
@Audit('Room')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class RoomController {
    constructor(private readonly roomService: RoomService) { }

    @Get()
    @ApiOperation({ summary: 'List all rooms' })
    @ApiResponse({ status: 200, description: 'Return all rooms.' })
    async findAll(@Req() req, @Query() query: GetRoomsDto) {
        // Assuming user object is attached to request by PrincipalAuthGuard
        const schoolId = req.user.schoolId;
        return this.roomService.findAll(schoolId, query);
    }

    @Get('template')
    @ApiOperation({ summary: 'Get room creation template' })
    @ApiResponse({ status: 200, description: 'Return template for bulk creation.' })
    async getTemplate() {
        return this.roomService.getTemplate();
    }

    @Post()
    @ApiOperation({ summary: 'Create a room' })
    @ApiResponse({ status: 201, description: 'The room has been successfully created.' })
    async create(@Req() req, @Body() createRoomDto: CreateRoomDto) {
        const schoolId = req.user.schoolId;
        return this.roomService.create(schoolId, createRoomDto);
    }
    @Get(':id')
    @ApiOperation({ summary: 'Get a room by id' })
    @ApiResponse({ status: 200, description: 'Return the room.' })
    async findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.roomService.findOne(schoolId, id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a room' })
    @ApiResponse({ status: 200, description: 'The room has been successfully updated.' })
    async update(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateRoomDto: UpdateRoomDto,
    ) {
        const schoolId = req.user.schoolId;
        return this.roomService.update(schoolId, id, updateRoomDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a room' })
    @ApiResponse({ status: 200, description: 'The room has been successfully deleted.' })
    async remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.roomService.remove(schoolId, id);
    }

    @Post('assign')
    @ApiOperation({ summary: 'Assign a room to a section' })
    @ApiResponse({ status: 201, description: 'Room assigned.' })
    async assignRoom(@Req() req, @Body() dto: AssignRoomDto) {
        const schoolId = req.user.schoolId;
        return this.roomService.assignRoom(schoolId, dto);
    }

    @Delete(':roomId/assignment/:sectionId')
    @ApiOperation({ summary: 'Unassign a room from a section' })
    @ApiResponse({ status: 200, description: 'Room unassigned.' })
    async unassignRoom(
        @Req() req,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('sectionId', ParseIntPipe) sectionId: number
    ) {
        const schoolId = req.user.schoolId;
        return this.roomService.unassignRoom(schoolId, roomId, sectionId);
    }

    @Post('bulk')
    @ApiOperation({ summary: 'Bulk create rooms' })
    @ApiResponse({ status: 201, description: 'Rooms have been successfully created.' })
    async bulkCreate(@Req() req, @Body() dto: BulkCreateRoomDto) {
        const schoolId = req.user.schoolId;
        return this.roomService.bulkCreate(schoolId, dto);
    }
}
