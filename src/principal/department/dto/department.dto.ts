import { IsEnum, IsNotEmpty, IsOptional, IsString, IsInt, IsBoolean } from 'class-validator';
import { DepartmentType, DepartmentStatus, RoleInDepartment } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
    @ApiProperty({ example: 'SCI', description: 'Unique code for the department (scoped to school)' })
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    @IsString()
    code: string;

    @ApiProperty({ example: 'Science', description: 'Name of the department' })
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 'Department of Science', description: 'Description of the department' })
    @IsOptional()
    @Transform(({ value }) => value?.trim())
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: DepartmentType, default: DepartmentType.ACADEMIC, description: 'Type of the department' })
    @IsOptional()
    @IsEnum(DepartmentType)
    type?: DepartmentType;

    @ApiPropertyOptional({ example: 1, description: 'ID of the user who is the Head of Department' })
    @IsOptional()
    @IsInt()
    headId?: number;
}

export class UpdateDepartmentDto {
    @ApiPropertyOptional({ example: 'SCI', description: 'Unique code for the department' })
    @IsOptional()
    @Transform(({ value }) => value?.trim())
    @IsString()
    code?: string;

    @ApiPropertyOptional({ example: 'Science', description: 'Name of the department' })
    @IsOptional()
    @Transform(({ value }) => value?.trim())
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'Department of Science', description: 'Description of the department' })
    @IsOptional()
    @Transform(({ value }) => value?.trim())
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: DepartmentType, description: 'Type of the department' })
    @IsOptional()
    @IsEnum(DepartmentType)
    type?: DepartmentType;

    @ApiPropertyOptional({ enum: DepartmentStatus, description: 'Status of the department' })
    @IsOptional()
    @IsEnum(DepartmentStatus)
    status?: DepartmentStatus;

    @ApiPropertyOptional({ example: 1, description: 'ID of the user who is the Head of Department' })
    @IsOptional()
    @IsInt()
    headId?: number;
}

export class DepartmentQueryDto {
    @ApiPropertyOptional({ example: 'Science', description: 'Search by name or code' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: DepartmentType, description: 'Filter by department type' })
    @IsOptional()
    @IsEnum(DepartmentType)
    type?: DepartmentType;

    @ApiPropertyOptional({ enum: DepartmentStatus, description: 'Filter by department status' })
    @IsOptional()
    @IsEnum(DepartmentStatus)
    status?: DepartmentStatus;

    @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number' })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    page?: number = 1;

    @ApiPropertyOptional({ example: 10, default: 10, description: 'Items per page' })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    limit?: number = 10;
}

export class AddDepartmentMemberDto {
    @ApiProperty({ example: 101, description: 'ID of the user to add' })
    @IsNotEmpty()
    @IsInt()
    userId: number;

    @ApiPropertyOptional({ enum: RoleInDepartment, default: RoleInDepartment.TEACHER, description: 'Role of the member in the department' })
    @IsOptional()
    @IsEnum(RoleInDepartment)
    role?: RoleInDepartment;
}

export class UpdateDepartmentMemberDto {
    @ApiPropertyOptional({ enum: RoleInDepartment, description: 'Role of the member in the department' })
    @IsOptional()
    @IsEnum(RoleInDepartment)
    role?: RoleInDepartment;

    @ApiPropertyOptional({ example: true, description: 'Whether the member is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
