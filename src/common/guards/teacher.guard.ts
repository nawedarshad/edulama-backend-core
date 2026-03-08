
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
export class TeacherAuthGuard implements CanActivate {
    private readonly logger = new Logger(TeacherAuthGuard.name);

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

            if (user.sub && !user.id) {
                user.id = user.sub;
            }

            if (user.role !== 'TEACHER') {
                throw new UnauthorizedException('Insufficient permissions');
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
            this.logger.error(`Token verification failed against ${authServiceUrl}`, error);
            throw new UnauthorizedException('Invalid token or auth service unavailable');
        }
    }
}
