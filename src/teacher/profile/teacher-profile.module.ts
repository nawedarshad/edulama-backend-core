import { Module } from '@nestjs/common';
import { TeacherProfileController } from './teacher-profile.controller';
import { TeacherProfileService } from './teacher-profile.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [TeacherProfileController],
    providers: [TeacherProfileService],
})
export class TeacherProfileModule { }
