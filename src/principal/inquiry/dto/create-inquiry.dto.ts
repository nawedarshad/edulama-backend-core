import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInquiryDto {
    @IsNotEmpty()
    schoolId: number;

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsNotEmpty()
    @IsString()
    phone: string;

    @IsOptional()
    @IsString()
    program?: string;

    @IsOptional()
    @IsString()
    message?: string;

    @IsNotEmpty()
    @IsString()
    // @IsEnum(['ADMISSION_FORM', 'CONTACT_FORM']) // Keeping it string for flexibility initially
    source: string;
}
