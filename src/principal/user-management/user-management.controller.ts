import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, ParseIntPipe, UseGuards } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UserSearchQueryDto, ResetPasswordDto, ManageIdentityDto, UpdateUserStatusDto, UpdateProfileDto, EnterpriseBulkDto } from './dto/user-management.dto';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthType } from '@prisma/client';

@ApiTags('Principal - User Management')
@ApiBearerAuth()
@Controller('principal/user-management')
@UseGuards(PrincipalAuthGuard)
export class UserManagementController {
    constructor(private readonly userManagementService: UserManagementService) { }

    @Get('search')
    search(@Req() req, @Query() query: UserSearchQueryDto) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.searchUsers(schoolId, query);
    }

    @Post('bulk-provision')
    bulkProvision(@Req() req, @Body() dto: EnterpriseBulkDto) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.bulkProvision(schoolId, dto);
    }

    @Get(':id')
    findOne(@Req() req, @Param('id', ParseIntPipe) id: number) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.getUserDetails(schoolId, id);
    }

    @Patch(':id/profile')
    updateProfile(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProfileDto) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.updateProfile(schoolId, id, dto);
    }

    @Post(':id/reset-password')
    resetPassword(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.resetPassword(schoolId, id, dto);
    }

    @Post(':id/identities')
    addIdentity(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: ManageIdentityDto) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.addIdentity(schoolId, id, dto);
    }

    @Delete(':id/identities/:type/:value')
    removeIdentity(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Param('type') type: AuthType,
        @Param('value') value: string
    ) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.removeIdentity(schoolId, id, type, value);
    }

    @Patch(':id/status')
    updateStatus(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserStatusDto) {
        const schoolId = req.user.schoolId;
        return this.userManagementService.updateStatus(schoolId, id, dto);
    }
}
