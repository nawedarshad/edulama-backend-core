import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';

@Controller('principal/global/notifications')
@UseGuards(PrincipalAuthGuard)
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Post()
    create(@Request() req, @Body() dto: CreateNotificationDto) {
        return this.notificationService.create(req.user.schoolId, req.user.id, dto);
    }

    @Get()
    findAll(@Request() req) {
        return this.notificationService.findAll(req.user.schoolId);
    }

    @Get('metadata')
    getMetadata(@Request() req) {
        return this.notificationService.getMetadata(req.user.schoolId);
    }
}
