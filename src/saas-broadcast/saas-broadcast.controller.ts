import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { SaasBroadcastService } from './saas-broadcast.service';
import { CreateSaasBroadcastDto, UpdateSaasBroadcastDto } from './dto/broadcast.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('SaaS Broadcast')
@Controller('api/system/broadcasts')
export class SaasBroadcastController {
  constructor(private readonly broadcastService: SaasBroadcastService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new SaaS broadcast' })
  create(@Body() dto: CreateSaasBroadcastDto) {
    return this.broadcastService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all SaaS broadcasts' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.broadcastService.findAll(activeOnly === 'true');
  }

  @Get('active')
  @ApiOperation({ summary: 'Get current active broadcast for a school' })
  findActiveForSchool(@Query('schoolId', ParseIntPipe) schoolId: number) {
    return this.broadcastService.findActiveForSchool(schoolId);
  }

  @Get(':id')
  @ApiBearerAuth()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.broadcastService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaasBroadcastDto,
  ) {
    return this.broadcastService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.broadcastService.remove(id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('isActive') isActive: boolean,
  ) {
    return this.broadcastService.toggleStatus(id, isActive);
  }
}
