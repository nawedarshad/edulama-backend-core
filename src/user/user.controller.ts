import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { UserAuthGuard } from '../common/guards/user.guard';

@Controller('users')
@UseGuards(UserAuthGuard)
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Patch('device-token')
    updateDeviceToken(
        @GetUser() user: User,
        @Body('token') token: string,
        @Body('appRole') appRole?: string
    ) {
        console.log(`DEBUG: Received device token update for user ${user.id}. Token: ${token?.substring(0, 10)}... AppRole: ${appRole}`);
        return this.userService.updateDeviceToken(user.id, token, appRole || 'DEFAULT');
    }
}
