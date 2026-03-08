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
export class PrincipalAuthGuard implements CanActivate {
    private readonly logger = new Logger(PrincipalAuthGuard.name);

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

        // Build auth headers: prefer Bearer token, fall back to forwarding the Cookie.
        const authHeader = request.headers.authorization;
        const cookieHeader = request.headers.cookie;

        if (!authHeader && !cookieHeader) {
            throw new UnauthorizedException('Missing or invalid authentication credentials');
        }

        const authMsHeaders: Record<string, string> = {};

        // 1. Try Authorization Header
        if (authHeader?.startsWith('Bearer ')) {
            authMsHeaders['Authorization'] = authHeader;
        }
        // 2. Fallback to Cookie (Extract accessToken manually)
        else if (cookieHeader) {
            const accessToken = this.extractAccessToken(cookieHeader);
            if (accessToken) {
                authMsHeaders['Authorization'] = `Bearer ${accessToken}`;
            } else {
                // If not accessToken, forward the raw cookie (for compatibility)
                authMsHeaders['Cookie'] = cookieHeader;
            }
        }
        else {
            throw new UnauthorizedException('Missing or invalid token');
        }

        try {
            const baseUrl = authServiceUrl.replace(/\/$/, '');
            const response = await lastValueFrom(
                this.httpService.get(`${baseUrl}/me`, { headers: authMsHeaders }),
            );

            const user = response.data.user;

            if (!user) {
                throw new UnauthorizedException('Invalid token: No user found in session');
            }

            // Ensure compatibility: map 'sub' to 'id' if 'id' is missing
            if (user.sub && !user.id) {
                user.id = user.sub;
            }

            // Check if user has PRINCIPAL role
            if (user.role !== 'PRINCIPAL') {
                this.logger.warn(`Access denied for user ${user.id}: Role is ${user.role}, expected PRINCIPAL`);
                throw new UnauthorizedException(`Insufficient permissions: Active role is ${user.role}`);
            }

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

            return true;
        } catch (error) {
            // If it's already an UnauthorizedException, re-throw it
            if (error instanceof UnauthorizedException) {
                throw error;
            }

            // If it's an Axios error, extract the message
            const axiosError = error?.response?.data;
            if (axiosError) {
                this.logger.error(`Auth MS returned error: ${JSON.stringify(axiosError)}`);
                throw new UnauthorizedException(axiosError.message || 'Authentication failed');
            }

            this.logger.error(`Token verification failed against ${authServiceUrl}`, error);
            throw new UnauthorizedException('Authentication service unavailable or connection failed');
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