import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { PrincipalAuthGuard } from '../../common/guards/principal.guard';

@ApiTags('Principal - Roles')
@ApiBearerAuth()
@Controller('principal/roles')
@UseGuards(PrincipalAuthGuard)
export class RoleController {
    constructor(private readonly roleService: RoleService) { }

    @Get()
    @ApiOperation({ summary: 'Get all available roles' })
    @ApiQuery({ name: 'excludeSystem', required: false, type: Boolean })
    @ApiResponse({ status: 200, description: 'List of roles' })
    async findAll(@Query('excludeSystem') excludeSystem?: string) {
        let roles = await this.roleService.findAll();
        if (excludeSystem === 'true') {
            roles = roles.filter(r => r.name !== 'ADMIN' && r.name !== 'PRINCIPAL');
        }
        return roles;
    }
}
