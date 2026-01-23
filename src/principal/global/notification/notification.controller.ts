import { Body, Controller, Get, Post, Request, UseGuards, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UserAuthGuard } from '../../../common/guards/user.guard';
import { PrincipalAuthGuard } from '../../../common/guards/principal.guard';

@Controller('principal/global/notifications')
@UseGuards(UserAuthGuard)
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    @Post()
    @UseGuards(PrincipalAuthGuard) // Only Principal/Admin should create generic notifications manually
    create(@Request() req, @Body() dto: CreateNotificationDto) {
        return this.notificationService.create(req.user.schoolId, req.user.id, dto);
    }

    @Get()
    @UseGuards(PrincipalAuthGuard) // Only Principal should see ALL notifications
    findAll(@Request() req) {
        return this.notificationService.findAll(req.user.schoolId);
    }

    @Get('metadata')
    getMetadata(@Request() req) {
        return this.notificationService.getMetadata(req.user.schoolId);
    }
    @Get('my')
    getMyNotifications(@Request() req) {
        return this.notificationService.getMyNotifications(req.user.schoolId, req.user.id);
    }

    @Delete('my/:id')
    deleteMyNotification(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.notificationService.deleteMyNotification(req.user.schoolId, req.user.id, id);
    }
}
