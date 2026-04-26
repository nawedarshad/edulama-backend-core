import { Controller, Post, Body, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserAuthGuard } from '../../../common/guards/user.guard';
import { DeliveryStatus, AckType } from '@prisma/client';

@Controller('principal/notification-responses')
export class NotificationResponseController {
    constructor(private readonly prisma: PrismaService) {}

    @UseGuards(UserAuthGuard)
    @Post(':notificationId/respond')
    async respond(
        @Request() req: any,
        @Param('notificationId', ParseIntPipe) notificationId: number,
        @Body() body: { responseText?: string, interaction?: any }
    ) {
        const userId = req.user.id;
        const schoolId = req.user.schoolId;

        return await this.prisma.$transaction(async (tx) => {
            // 1. Update Notification Delivery Status
            await tx.notificationDelivery.updateMany({
                where: {
                    notificationId: BigInt(notificationId),
                    userId,
                },
                data: {
                    status: DeliveryStatus.RESPONDED,
                    readAt: new Date(),
                    respondedAt: new Date(),
                    responseJson: body.interaction || {},
                }
            });

            // 2. If it's an announcement notification, create an AnnouncementAck
            const notification = await tx.notification.findUnique({
                where: { id: BigInt(notificationId) },
                select: { metadata: true }
            });

            const metadata = notification?.metadata as any;
            if (metadata?.announcementId) {
                await tx.announcementAck.upsert({
                    where: {
                        schoolId_announcementId_userId_ackType: {
                            schoolId,
                            announcementId: Number(metadata.announcementId),
                            userId,
                            ackType: AckType.ACKNOWLEDGE
                        }
                    },
                    create: {
                        schoolId,
                        announcementId: Number(metadata.announcementId),
                        userId,
                        ackType: AckType.ACKNOWLEDGE,
                        responseText: body.responseText || 'Acknowledged via App'
                    },
                    update: {
                        responseText: body.responseText || 'Updated via App',
                        createdAt: new Date()
                    }
                });
            }

            return { success: true };
        });
    }

    @UseGuards(UserAuthGuard)
    @Post(':notificationId/read')
    async markAsRead(
        @Request() req: any,
        @Param('notificationId', ParseIntPipe) notificationId: number
    ) {
        const userId = req.user.id;

        await this.prisma.notificationDelivery.updateMany({
            where: {
                notificationId: BigInt(notificationId),
                userId,
                readAt: null
            },
            data: {
                status: DeliveryStatus.READ,
                readAt: new Date()
            }
        });

        return { success: true };
    }
}
