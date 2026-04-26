import { Controller, Get, Post, Body, Patch, Param, Delete, Request, UseGuards, Query, ParseIntPipe } from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { PrincipalOrTeacherGuard } from '../common/guards/principal-teacher.guard';
import { TaskStatus } from '@prisma/client';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(PrincipalOrTeacherGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Request() req, @Body() createTaskDto: CreateTaskDto) {
    return this.taskService.create(req.user.id, req.user.schoolId, createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks' })
  @ApiQuery({ name: 'status', enum: TaskStatus, required: false })
  @ApiQuery({ name: 'type', enum: ['MY_TASKS', 'ASSIGNED_TO_ME', 'CREATED_BY_ME'], required: false })
  findAll(
    @Request() req,
    @Query('status') status?: TaskStatus,
    @Query('type') type?: 'MY_TASKS' | 'ASSIGNED_TO_ME' | 'CREATED_BY_ME'
  ) {
    return this.taskService.findAll(req.user.schoolId, req.user.id, { status, type });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.taskService.findOne(id, req.user.schoolId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: UpdateTaskDto
  ) {
    return this.taskService.update(id, req.user.id, req.user.schoolId, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.taskService.remove(id, req.user.id, req.user.schoolId);
  }
}
