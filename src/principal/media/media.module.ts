import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { FileUploadModule } from '../../common/file-upload/file-upload.module';

@Module({
    imports: [HttpModule, ConfigModule, FileUploadModule],
    controllers: [MediaController],
    providers: [MediaService],
    exports: [MediaService],
})
export class MediaModule {}
