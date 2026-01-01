import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { TodoService } from './todo.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { UserAuthGuard } from '../common/guards/user.guard';
import { Audit } from '../common/audit/audit.decorator';

@Controller('todos')
@UseGuards(UserAuthGuard)
@Audit('Todo')
export class TodoController {
    constructor(private readonly todoService: TodoService) { }

    @Post()
    create(@Req() req, @Body() createTodoDto: CreateTodoDto) {
        return this.todoService.create(req.user.id, req.user.schoolId, createTodoDto);
    }

    @Get()
    findAll(@Req() req) {
        return this.todoService.findAll(req.user.id);
    }

    @Get(':id')
    findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.todoService.findOne(req.user.id, id);
    }

    @Patch(':id')
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() updateTodoDto: UpdateTodoDto) {
        return this.todoService.update(req.user.id, id, updateTodoDto);
    }

    @Patch(':id/complete')
    toggleComplete(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.todoService.toggleComplete(req.user.id, id);
    }

    @Delete(':id')
    remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.todoService.remove(req.user.id, id);
    }
}
