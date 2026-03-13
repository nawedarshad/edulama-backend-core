import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AppConfigService {
    constructor(private readonly prisma: PrismaService) { }

    async getConfig() {
        const settings = await this.prisma.platformSetting.findMany({
            where: {
                key: {
                    in: [
                        'TEACHER_APP_MIN_VERSION',
                        'TEACHER_APP_STORE_URL',
                        'TEACHER_APP_MAINTENANCE_MODE',
                        'TEACHER_APP_MAINTENANCE_MESSAGE'
                    ]
                }
            }
        });

        const config: Record<string, string> = {};
        settings.forEach(s => {
            config[s.key] = s.value;
        });

        return {
            minVersion: config['TEACHER_APP_MIN_VERSION'] || '1.0.0',
            storeUrl: config['TEACHER_APP_STORE_URL'] || 'https://play.google.com/store',
            isMaintenance: config['TEACHER_APP_MAINTENANCE_MODE'] === 'true',
            maintenanceMessage: config['TEACHER_APP_MAINTENANCE_MESSAGE'] || 'We are currently performing scheduled maintenance. Please check back later.'
        };
    }
}
