
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [RoomController],
    providers: [RoomService],
})
export class RoomModule { }
