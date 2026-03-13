import { IsString, IsNotEmpty } from 'class-validator';

export class UpdatePlatformSettingDto {
    @IsString()
    @IsNotEmpty()
    key: string;

    @IsString()
    value: string;
}
