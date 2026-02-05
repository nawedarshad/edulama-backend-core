import { IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, IsInt } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
    @IsEnum(NotificationType)
    @IsNotEmpty()
    type: NotificationType;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    message: string;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    targetUserIds?: number[];

    @IsString()
    @IsOptional()
    expiresAt?: string;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    targetRoleIds?: number[];

    @IsOptional()
    data?: Record<string, any>;
}
