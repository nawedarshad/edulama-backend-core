import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '@prisma/client';
// Using a generic AuthGuard if available, or try specific guards. 
// Ideally we want a global AuthGuard, but since I don't see one in app.module, 
// I'll try to find a common one or create a basic one.
// The PrincipalAnnouncementController used PrincipalAuthGuard.
// Let's assume there is a basic 'JwtAuthGuard' or similar commonly used.
// If not found, I might need to skip the guard or find the correct one.
// Let's check 'src/auth' content first or just implement without guard for now and user can fix imports.
// Wait, I saw 'PrincipalAuthGuard` in `common/guards`. Let's check `common/guards`.
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Patch('device-token')
    updateDeviceToken(@GetUser() user: User, @Body('token') token: string) {
        return this.userService.updateDeviceToken(user.id, token);
    }
}
