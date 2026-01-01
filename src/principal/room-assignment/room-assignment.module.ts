import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RoomAssignmentService } from './room-assignment.service';
import { RoomAssignmentController } from './room-assignment.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule, HttpModule, ConfigModule],
    controllers: [RoomAssignmentController],
    providers: [RoomAssignmentService],
})
export class RoomAssignmentModule { }
