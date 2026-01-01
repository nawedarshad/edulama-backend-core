import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TodoService } from './todo.service';
import { TodoController } from './todo.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UserAuthGuard } from '../common/guards/user.guard';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [TodoController],
    providers: [TodoService, UserAuthGuard],
})
export class TodoModule { }
