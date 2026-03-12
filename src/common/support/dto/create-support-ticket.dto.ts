import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class CreatePlatformSupportTicketDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    schoolName?: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    phone?: string;
}
