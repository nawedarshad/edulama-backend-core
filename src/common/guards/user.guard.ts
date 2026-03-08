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
export class UserAuthGuard implements CanActivate {
    private readonly logger = new Logger(UserAuthGuard.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authServiceUrl = this.configService.get<string>('AUTH_MS_URL');

        if (!authServiceUrl) {
            this.logger.error('AUTH_MS_URL is not defined');
            throw new UnauthorizedException('System configuration error');
        }

        const authHeader = request.headers.authorization;
        const cookieHeader = request.headers.cookie;

        if (!authHeader && !cookieHeader) {
            throw new UnauthorizedException('Missing or invalid authentication credentials');
        }

        const authMsHeaders: Record<string, string> = {};
        if (authHeader?.startsWith('Bearer ')) {
            authMsHeaders['Authorization'] = authHeader;
        } else if (cookieHeader) {
            authMsHeaders['Cookie'] = cookieHeader;
        } else {
            throw new UnauthorizedException('Missing or invalid token');
        }

        try {
            const baseUrl = authServiceUrl.replace(/\/$/, '');
            const response = await lastValueFrom(
                this.httpService.get(`${baseUrl}/me`, { headers: authMsHeaders }),
            );

            const user = response.data.user;

            if (!user) {
                throw new UnauthorizedException('Invalid token');
            }

            // Ensure compatibility: map 'sub' to 'id' if 'id' is missing
            if (user.sub && !user.id) {
                user.id = user.sub;
            }

            // No role check — any authenticated user is allowed
            request.user = user;
            return true;
        } catch (error) {
            this.logger.error('Token verification failed', error.message);
            throw new UnauthorizedException('Invalid token or auth service unavailable');
        }
    }
}
