import { Controller, Post, Body } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreatePlatformSupportTicketDto } from './dto/create-support-ticket.dto';

@Controller('api/support')
export class SupportController {
    constructor(private readonly supportService: SupportService) {}

    @Post()
    create(@Body() dto: CreatePlatformSupportTicketDto) {
        return this.supportService.createTicket(dto);
    }
}
