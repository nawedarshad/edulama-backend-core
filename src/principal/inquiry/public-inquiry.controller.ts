import { Body, Controller, Post, Get } from '@nestjs/common';
import { InquiryService } from './inquiry.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';

@Controller('api/public/inquiry')
export class PublicInquiryController {
    constructor(private readonly inquiryService: InquiryService) {
        console.log("PublicInquiryController initialized");
    }

    @Get('test')
    test() {
        return { message: "Public Inquiry Controller is working" };
    }

    @Post()
    async create(@Body() dto: CreateInquiryDto) {
        return this.inquiryService.create(Number(dto.schoolId), dto);
    }
}
