import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InquiryService } from './inquiry.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('api/principal/inquiry')
export class InquiryController {
    constructor(private readonly inquiryService: InquiryService) { }

    // Protected Routes for Principal
    @UseGuards(PrincipalAuthGuard)
    @Get()
    async findAll(@GetUser() user: any) {
        return this.inquiryService.findAll(user.schoolId);
    }

    @UseGuards(PrincipalAuthGuard)
    @Patch(':id/status')
    async updateStatus(
        @GetUser() user: any,
        @Param('id') id: string,
        @Body('status') status: string,
    ) {
        return this.inquiryService.updateStatus(Number(id), user.schoolId, status);
    }

    // Public Route for Forms
    // Note: We need a way to identify the school for public submissions. 
    // Usually this comes from the subdomain or a specific public endpoint containing schoolId/code.
    // For now, I will create a separate 'public/inquiry' implementation or handle it here if I can bypass auth.
}
