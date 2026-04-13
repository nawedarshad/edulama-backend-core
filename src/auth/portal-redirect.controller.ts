import {
    Controller,
    Get,
    Req,
    Res,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { lastValueFrom } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Portal Redirect
 *
 * GET /core/auth/portal
 *
 * The browser hits this endpoint after login. It reads the session cookie automatically
 * sent by the browser, forwards it to the Auth MS (/me), then issues a 302 redirect to:
 *
 *   https://{school.subdomain}.{PORTAL_BASE_DOMAIN}/{role.toLowerCase()}
 *
 * No schoolId or token in the URL. No query params. The Auth MS owns context from cookie.
 */
@ApiTags('Auth')
@Controller('auth/portal')
export class PortalRedirectController {
    private readonly logger = new Logger(PortalRedirectController.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Portal Redirect', description: 'Redirects the user to their respective school portal based on their session cookie.' })
    @ApiResponse({ status: 302, description: 'Redirects to the portal URL.' })
    @ApiResponse({ status: 401, description: 'Unauthorized if session is invalid or cookie is missing.' })
    async redirectToPortal(@Req() req: Request, @Res() res: Response) {
        const authMsUrl = this.configService.get<string>('AUTH_MS_URL');
        const portalBaseDomain = this.configService.get<string>('PORTAL_BASE_DOMAIN', 'edulama.com');

        if (!authMsUrl) {
            this.logger.error('AUTH_MS_URL is not defined');
            throw new UnauthorizedException('System configuration error');
        }

        // Forward the entire Cookie header to the Auth MS so it can identify the session.
        const cookieHeader = req.headers.cookie;

        if (!cookieHeader) {
            throw new UnauthorizedException('No session cookie found. Please log in first.');
        }

        let user: any;
        try {
            const baseUrl = authMsUrl.replace(/\/$/, '');
            const response = await lastValueFrom(
                this.httpService.get(`${baseUrl}/me`, {
                    headers: { Cookie: cookieHeader },
                }),
            );

            user = response.data?.user;
        } catch (error) {
            this.logger.error('Auth MS call failed during portal redirect', error?.message);
            throw new UnauthorizedException('Session invalid or auth service unavailable');
        }

        if (!user) {
            throw new UnauthorizedException('Could not resolve user from session');
        }

        // Auth MS must return school subdomain. Support both nested and flat shapes.
        const subdomain: string | undefined =
            user.school?.subdomain ?? user.schoolSubdomain ?? user.subdomain;

        const role: string = (user.role ?? 'dashboard').toLowerCase();

        if (!subdomain) {
            this.logger.error(
                `No school subdomain found in auth MS response for user ${user.id ?? '?'}`,
            );
            throw new UnauthorizedException('School association not found for this account');
        }

        const portalUrl = `https://${subdomain}.${portalBaseDomain}/${role}`;
        this.logger.log(`Redirecting user ${user.id ?? '?'} (${role}) → ${portalUrl}`);

        return res.redirect(302, portalUrl);
    }
}
