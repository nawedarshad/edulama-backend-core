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
    (data: string | undefined, ctx: ExecutionContext): AuthUserPayload | any => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user;

        return data ? user?.[data] : user;
    },
);
