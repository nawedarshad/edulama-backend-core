import { PartialType } from '@nestjs/mapped-types';
import { CreateSchoolAdminDto } from './create-school-admin.dto';
import { IsString, IsNotEmpty, IsArray, IsEnum, IsOptional } from 'class-validator';
import { SchoolAdminPermission } from '../school-admin-permissions.enum';

export class UpdateSchoolAdminDto extends PartialType(CreateSchoolAdminDto) {
    // You can override/add specific validation here if needed
    // but PartialType handles making fields optional.
}
