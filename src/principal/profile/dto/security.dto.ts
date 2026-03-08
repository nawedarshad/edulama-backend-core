import { IsString, IsNotEmpty, IsEmail, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
    @ApiProperty({ example: 'currentPassword123' })
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @ApiProperty({ example: 'newPassword123', minLength: 8 })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    newPassword: string;
}

export class UpdateEmailDto {
    @ApiProperty({ example: 'newemail@example.com' })
    @IsEmail()
    @IsNotEmpty()
    newEmail: string;
}

export class UpdateUsernameDto {
    @ApiProperty({ example: 'new_username' })
    @IsString()
    @IsNotEmpty()
    newUsername: string;
}

export class Toggle2FADto {
    @ApiProperty({ example: true })
    @IsBoolean()
    @IsNotEmpty()
    enabled: boolean;
}
