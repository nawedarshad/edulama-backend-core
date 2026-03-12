import { Controller, Get, Patch, Body, Query } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingDto } from './dto/update-platform-setting.dto';

@Controller('api/admin/platform-settings')
export class PlatformSettingsController {
    constructor(private readonly settingsService: PlatformSettingsService) {}

    @Get()
    findAll() {
        return this.settingsService.getAllSettings();
    }

    @Get('by-key')
    findByKey(@Query('key') key: string) {
        return this.settingsService.getSetting(key);
    }

    @Patch()
    update(@Body() dto: UpdatePlatformSettingDto) {
        return this.settingsService.updateSetting(dto);
    }
}
