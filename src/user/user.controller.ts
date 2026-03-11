import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { TeacherAuthGuard } from '../common/guards/teacher.guard';

@Controller('users')
@UseGuards(TeacherAuthGuard)
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Patch('device-token')
    updateDeviceToken(@GetUser() user: User, @Body('token') token: string) {
        console.log(`DEBUG: Received device token update for user ${user.id}. Token: ${token?.substring(0, 10)}...`);
        return this.userService.updateDeviceToken(user.id, token);
    }
}
