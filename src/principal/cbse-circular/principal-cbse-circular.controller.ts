import { Controller, Get, Param, Query, ParseIntPipe, UseGuards, Post, Body } from '@nestjs/common';
import { PrincipalCbseCircularService } from './principal-cbse-circular.service';
import { CbseCircularQueryDto } from '../../saas-admin/cbse-circular/dto/cbse-circular-query.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller(['api/principal/cbse-circulars', 'principal/cbse-circulars'])
@UseGuards(PrincipalAuthGuard)
export class PrincipalCbseCircularController {
    constructor(private readonly service: PrincipalCbseCircularService) {
        console.log("PrincipalCbseCircularController initialized");
    }

    @Get()
    findAll(@Query() query: CbseCircularQueryDto) {
        return this.service.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number, @GetUser('id') userId: number, @GetUser('role') userRole: string) {
        console.log(`[PrincipalCbseCircularController] GET /${id} by User ${userId} (${userRole})`);
        return this.service.findOne(id, userId, userRole);
    }

    @Post(':id/download/:attachmentId')
    recordDownload(
        @Param('id', ParseIntPipe) id: number,
        @Param('attachmentId', ParseIntPipe) attachmentId: number,
        @GetUser('id') userId: number,
        @GetUser('role') userRole: string
    ) {
        console.log(`[PrincipalCbseCircularController] DOWNLOAD /${id}/download/${attachmentId} by User ${userId}`);
        return this.service.recordDownload(id, attachmentId, userId, userRole);
    }
}
