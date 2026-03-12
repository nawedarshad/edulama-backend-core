import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePlatformSettingDto } from './dto/update-platform-setting.dto';

@Injectable()
export class PlatformSettingsService {
    constructor(private prisma: PrismaService) {}

    async getAllSettings() {
        return this.prisma.platformSetting.findMany();
    }

    async getSetting(key: string) {
        return this.prisma.platformSetting.findUnique({
            where: { key },
        });
    }

    async updateSetting(dto: UpdatePlatformSettingDto) {
        return this.prisma.platformSetting.upsert({
            where: { key: dto.key },
            update: { value: dto.value },
            create: { key: dto.key, value: dto.value },
        });
    }
}
