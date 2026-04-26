import { IsString, IsEnum, IsOptional, IsBoolean, IsArray, IsInt, IsDateString } from 'class-validator';
import { SaasBroadcastType, SaasPriority } from '@prisma/client';

export class CreateSaasBroadcastDto {
  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsEnum(SaasBroadcastType)
  @IsOptional()
  type?: SaasBroadcastType;

  @IsEnum(SaasPriority)
  @IsOptional()
  priority?: SaasPriority;

  @IsString()
  @IsOptional()
  actionLabel?: string;

  @IsString()
  @IsOptional()
  actionLink?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  targetSchools?: number[];
}

export class UpdateSaasBroadcastDto extends CreateSaasBroadcastDto {}
