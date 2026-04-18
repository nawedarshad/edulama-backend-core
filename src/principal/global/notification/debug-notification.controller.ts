import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationService } from './notification.service';

@ApiTags('Debug')
@Controller('debug')
export class DebugNotificationController {
    private readonly logger = new Logger(DebugNotificationController.name);

    constructor(private readonly notificationService: NotificationService) {}

    @Post('test-emergency-push')
    @ApiOperation({ summary: 'TEMPORARY: Trigger a test emergency alert for Google Play verification' })
    async testEmergencyPush(
        @Body() body: { token: string; delaySeconds?: number }
    ) {
        const { token, delaySeconds = 0 } = body;
        
        this.logger.log(`Received request to send test emergency alert to token: ${token.substring(0, 10)}... in ${delaySeconds}s`);

        // Use a timeout to give the user time to lock their phone
        setTimeout(async () => {
            try {
                // Accessing the private method sendPushNotifications via casting to any
                // since this is a temporary debug tool.
                await (this.notificationService as any).sendPushNotifications(
                    [{ token, userId: 0 }],
                    'CRITICAL EMERGENCY ALERT',
                    'This is a test emergency broadcast for terminal verification. Please stay calm.',
                    { 
                        priority: 'CRITICAL',
                        type: 'ALERT',
                        isEmergency: 'true'
                    }
                );
                this.logger.log('Test emergency alert sent successfully.');
            } catch (error) {
                this.logger.error('Failed to send test emergency alert:', error);
            }
        }, delaySeconds * 1000);

        return {
            success: true,
            message: `Emergency alert scheduled in ${delaySeconds} seconds for token ending in ...${token.substring(token.length - 5)}`,
            instruction: 'Lock your phone or put app in background now to test the high-priority wake-up behavior.'
        };
    }
}
