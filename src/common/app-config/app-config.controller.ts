import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppConfigService } from './app-config.service';

@ApiTags('Application Configuration')
@Controller('app/config')
export class AppConfigController {
    constructor(private readonly appConfigService: AppConfigService) { }

    @Get()
    @ApiOperation({ summary: 'Get application configuration' })
    getConfig() {
        return this.appConfigService.getConfig();
    }
}
