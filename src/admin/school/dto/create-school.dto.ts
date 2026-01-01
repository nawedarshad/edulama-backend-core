
import { IsEmail, IsNotEmpty, IsString, IsArray, MinLength, IsOptional } from 'class-validator';

export class CreateSchoolDto {
    @IsString()
    @IsNotEmpty()
    schoolName: string;

    @IsString()
    @IsNotEmpty()
    schoolCode: string;

    @IsString()
    @IsNotEmpty()
    subdomain: string;

    @IsString()
    @IsNotEmpty()
    academicYearName: string;

    @IsString()
    @IsNotEmpty()
    principalName: string;

    @IsEmail()
    @IsNotEmpty()
    principalEmail: string;

    @IsString()
    @MinLength(8)
    principalPassword: string;

    @IsArray()
    @IsOptional()
    modules: string[];
}
