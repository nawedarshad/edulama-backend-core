import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
    @ApiResponse({ status: 200, description: 'List of roles' })
    async findAll() {
        return this.roleService.findAll();
    }
}
