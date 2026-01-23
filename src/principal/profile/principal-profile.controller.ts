import { Controller, Get, Patch, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrincipalProfileService } from './principal-profile.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { UpdatePrincipalProfileDto } from './dto/update-principal-profile.dto';
import type { User } from '@prisma/client';

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
    getProfile(@GetUser() user: User) {
        this.logger.log(`Getting profile for user: ${JSON.stringify(user)}`);
        return this.service.getProfile(user.id, user.schoolId);
    }

    @Patch()
    @ApiOperation({ summary: 'Update my profile', description: 'Updates the logged-in principal\'s name or photo.' })
    @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
    updateProfile(
        @GetUser() user: User,
        @Body() dto: UpdatePrincipalProfileDto
    ) {
        this.logger.log(`Updating profile for user ${user?.id} with data: ${JSON.stringify(dto)}`);
        return this.service.updateProfile(user.id, user.schoolId, dto);
    }
}
