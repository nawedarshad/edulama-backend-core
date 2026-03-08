import { Controller, Get, Patch, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrincipalProfileService } from './principal-profile.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { AuthUserPayload } from '../../common/decorators/get-user.decorator';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { UpdatePrincipalProfileDto } from './dto/update-principal-profile.dto';
import { ChangePasswordDto, UpdateEmailDto, UpdateUsernameDto, Toggle2FADto } from './dto/security.dto';

@ApiTags('Principal - Profile')
@ApiBearerAuth()
@UseGuards(PrincipalAuthGuard)
@Controller('principal/profile')
export class PrincipalProfileController {
    private readonly logger = new Logger(PrincipalProfileController.name);
    constructor(private readonly service: PrincipalProfileService) { }

    @Get()
    @ApiOperation({ summary: 'Get my profile', description: 'Returns the logged-in principal\'s profile details.' })
    @ApiResponse({ status: 200, description: 'Profile details.' })
    getProfile(@GetUser() user: AuthUserPayload) {
        this.logger.log(`Getting profile for user: ${JSON.stringify(user)}`);
        return this.service.getProfile(user.id, user.schoolId);
    }

    @Patch()
    @ApiOperation({ summary: 'Update my profile', description: 'Updates the logged-in principal\'s name or photo.' })
    @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
    updateProfile(
        @GetUser() user: AuthUserPayload,
        @Body() dto: UpdatePrincipalProfileDto
    ) {
        this.logger.log(`Updating profile for user ${user?.id} with data: ${JSON.stringify(dto)}`);
        return this.service.updateProfile(user.id, user.schoolId, dto);
    }

    @Get('security')
    @ApiOperation({ summary: 'Get security info' })
    getSecurityInfo(@GetUser() user: AuthUserPayload) {
        return this.service.getSecurityInfo(user.id);
    }

    @Post('security/password')
    @ApiOperation({ summary: 'Change password' })
    changePassword(
        @GetUser() user: AuthUserPayload,
        @Body() dto: ChangePasswordDto
    ) {
        return this.service.changePassword(user.id, dto);
    }

    @Patch('security/email')
    @ApiOperation({ summary: 'Update login email' })
    updateEmail(
        @GetUser() user: AuthUserPayload,
        @Body() dto: UpdateEmailDto
    ) {
        return this.service.updateEmail(user.id, dto);
    }

    @Patch('security/username')
    @ApiOperation({ summary: 'Update username' })
    updateUsername(
        @GetUser() user: AuthUserPayload,
        @Body() dto: UpdateUsernameDto
    ) {
        return this.service.updateUsername(user.id, dto);
    }

    @Patch('security/2fa')
    @ApiOperation({ summary: 'Toggle 2FA' })
    toggle2FA(
        @GetUser() user: AuthUserPayload,
        @Body() dto: Toggle2FADto
    ) {
        return this.service.toggle2FA(user.id, dto);
    }

    @Get('activity/logs')
    @ApiOperation({ summary: 'Get activity logs' })
    getActivityLogs(@GetUser() user: AuthUserPayload) {
        return this.service.getActivityLogs(user.id);
    }

    @Get('activity/memo')
    @ApiOperation({ summary: 'Get personal memo' })
    getMemo(@GetUser() user: AuthUserPayload) {
        return this.service.getMemo(user.id);
    }

    @Patch('activity/memo')
    @ApiOperation({ summary: 'Update personal memo' })
    updateMemo(
        @GetUser() user: AuthUserPayload,
        @Body('content') content: string
    ) {
        return this.service.updateMemo(user.id, content);
    }
}
