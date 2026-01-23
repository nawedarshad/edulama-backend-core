
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class StudentAuthGuard implements CanActivate {
    private readonly logger = new Logger(StudentAuthGuard.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or invalid token');
        }

        const token = authHeader.split(' ')[1];
        const authServiceUrl = this.configService.get<string>('AUTH_MS_URL');

        if (!authServiceUrl) {
            this.logger.error('AUTH_MS_URL is not defined');
            throw new UnauthorizedException('System configuration error');
        }

        try {
            const baseUrl = authServiceUrl.replace(/\/$/, '');
            const response = await lastValueFrom(
                this.httpService.post(
                    `${baseUrl}/verify`,
                    {},
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    },
                ),
            );

            const user = response.data;

            // Check if user has STUDENT role
            if (!user || user.role !== 'STUDENT') {
                throw new UnauthorizedException('Insufficient permissions');
            }

            // Attach user to request for further use
            request.user = user;
            return true;
        } catch (error) {
            this.logger.error(`Token verification failed against ${authServiceUrl}`, error);
            throw new UnauthorizedException('Invalid token or auth service unavailable');
        }
    }
}
