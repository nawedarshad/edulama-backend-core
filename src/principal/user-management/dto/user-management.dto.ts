import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthType } from '@prisma/client';

export class UserSearchQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    role?: string;

    @IsOptional()
    @IsInt()
    page?: number;

    @IsOptional()
    @IsInt()
    limit?: number;
}

export class ResetPasswordDto {
    @IsNotEmpty()
    @IsString()
    @MinLength(6)
    newPassword: string;
}

export class ManageIdentityDto {
    @IsNotEmpty()
    @IsEnum(AuthType)
    type: AuthType;

    @IsNotEmpty()
    @IsString()
    value: string;

    @IsOptional()
    @IsString()
    secret?: string;

    @IsOptional()
    verified?: boolean;
}

export class UpdateUserStatusDto {
    @IsNotEmpty()
    isActive: boolean;
}

export class UpdateProfileDto {
    @IsNotEmpty()
    @IsString()
    name: string;
}

export class EnterpriseBulkDto {
    @IsNotEmpty()
    @IsString()
    scope: 'ALL' | 'STUDENTS' | 'PARENTS';

    @IsOptional()
    @IsInt()
    classId?: number;

    @IsOptional()
    @IsInt()
    sectionId?: number;

    @IsOptional()
    provisionMissing?: boolean;

    @IsOptional()
    resetExisting?: boolean;

    @IsOptional()
    syncUsernames?: boolean;
}
