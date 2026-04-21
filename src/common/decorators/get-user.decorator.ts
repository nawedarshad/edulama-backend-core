import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUserPayload {
    id: number;
    sub: number;
    schoolId: number;
    roleId: number;
    email?: string;
    // other legacy properties that controllers optionally use:
    academicYearId?: number;
    permissions?: string[];
    role?: string;
}

export const GetUser = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext): AuthUserPayload => {
        const request = ctx.switchToHttp().getRequest();
        return data ? request.user?.[data] : request.user;
    },
);
