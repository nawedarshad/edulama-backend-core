import { IsNotEmpty, IsString, IsEmail, IsOptional, IsArray, IsInt, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SchoolAdminPermission } from '../school-admin-permissions.enum';

export class CreateSchoolAdminDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    password?: string;

    @IsArray()
    @IsEnum(SchoolAdminPermission, { each: true })
    @IsOptional()
    permissions?: SchoolAdminPermission[];

    @IsArray()
    @IsInt({ each: true })
    @Type(() => Number)
    @IsOptional()
    classIds?: number[];

    @IsArray()
    @IsInt({ each: true })
    @Type(() => Number)
    @IsOptional()
    sectionIds?: number[];
}
