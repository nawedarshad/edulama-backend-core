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
            const accessToken = this.extractAccessToken(cookieHeader);
            if (accessToken) {
                authMsHeaders['Authorization'] = `Bearer ${accessToken}`;
            } else {
                authMsHeaders['Cookie'] = cookieHeader;
            }
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

            // Inject context from headers — header always wins (user's active session context)
            const headerAcademicYearId = request.headers['x-academic-year-id'];
            const headerSchoolId = request.headers['x-school-id'];
            if (headerAcademicYearId) {
                request.user.academicYearId = parseInt(headerAcademicYearId as string);
            }
            if (headerSchoolId) {
                request.user.schoolId = parseInt(headerSchoolId as string);
            }

            // --- CRITICAL HARDENING: Ensure core identifiers are non-null ---
            if (!request.user.id || !request.user.schoolId) {
                this.logger.error(`Missing core identity: id=${request.user.id}, schoolId=${request.user.schoolId}`);
                throw new UnauthorizedException('Authentication payload missing required school/user identifiers');
            }

            return true;
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            this.logger.error('Token verification failed', error.message);
            throw new UnauthorizedException('Invalid token or auth service unavailable');
        }
    }

    private extractAccessToken(cookieHeader: string): string | null {
        try {
            const cookies = cookieHeader.split(';').reduce((acc, c) => {
                const [n, v] = c.split('=');
                if (n && v) {
                    acc[n.trim()] = v.trim();
                }
                return acc;
            }, {} as Record<string, string>);

            return cookies['accessToken'] || null;
        } catch (e) {
            return null;
        }
    }
}
