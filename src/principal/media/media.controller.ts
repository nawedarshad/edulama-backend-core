import { 
    Controller, 
    Get, 
    Post, 
    Delete, 
    UseGuards, 
    Request, 
    Query, 
    UseInterceptors, 
    UploadedFile, 
    BadRequestException,
    Param
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@ApiTags('Principal - Website Media')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard)
@Controller('principal/media')
export class MediaController {
    constructor(private readonly mediaService: MediaService) {}

    @ApiOperation({ summary: 'List all website media files' })
    @Get()
    listFiles(@Request() req) {
        const schoolId = req.user.schoolId;
        return this.mediaService.listFiles(schoolId);
    }

    @ApiOperation({ summary: 'Upload website media file' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @Post()
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for website assets
    }))
    uploadFile(
        @Request() req,
        @UploadedFile() file: any
    ) {
        if (!file) throw new BadRequestException('No file provided');
        const schoolId = req.user.schoolId;
        return this.mediaService.uploadFile(schoolId, file);
    }

    @ApiOperation({ summary: 'Delete a website media file' })
    @Delete()
    deleteFile(
        @Request() req,
        @Query('filename') filename: string
    ) {
        if (!filename) throw new BadRequestException('Filename is required');
        const schoolId = req.user.schoolId;
        return this.mediaService.deleteFile(schoolId, filename);
    }
}
