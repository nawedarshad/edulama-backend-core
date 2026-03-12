import { Controller, Post, Body, Get } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreatePlatformSupportTicketDto } from './dto/create-support-ticket.dto';

@Controller('api/support')
export class SupportController {
    constructor(private readonly supportService: SupportService) {}

    @Get()
    findAll() {
        return this.supportService.findAllTickets();
    }

    @Post()
    create(@Body() dto: CreatePlatformSupportTicketDto) {
        return this.supportService.createTicket(dto);
    }
}
