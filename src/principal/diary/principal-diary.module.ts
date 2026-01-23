import { Module } from '@nestjs/common';
import { PrincipalDiaryService } from './principal-diary.service';
import { PrincipalDiaryController } from './principal-diary.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [PrincipalDiaryController],
    providers: [PrincipalDiaryService],
})
export class PrincipalDiaryModule { }
