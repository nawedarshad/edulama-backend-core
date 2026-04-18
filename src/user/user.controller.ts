import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { UserAuthGuard } from '../common/guards/user.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Common')
@ApiBearerAuth()
@Controller('users')
@UseGuards(UserAuthGuard)
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Patch('device-token')
    @ApiOperation({ summary: 'Update device token', description: 'Updates the FCM device token for push notifications.' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                token: { type: 'string', description: 'The FCM token' },
                appRole: { type: 'string', description: 'Optional role filtering for notifications', example: 'TEACHER' }
            },
            required: ['token']
        }
    })
    updateDeviceToken(
        @GetUser() user: User,
        @Body('token') token: string,
        @Body('appRole') appRole?: string
    ) {
        this.logger.log(`[UserController] DEVICE TOKEN UPDATE REQUEST: userId=${user.id}, appRole=${appRole || 'DEFAULT'}, tokenPrefix=${token?.substring(0, 10)}...`);
        return this.userService.updateDeviceToken(user.id, token, appRole || 'DEFAULT');
    }
}
