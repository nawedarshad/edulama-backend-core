
import { IsNotEmpty, IsNumber, IsInt } from 'class-validator';

export class ManageSchoolFeatureDto {
    @IsNumber()
    @IsInt()
    @IsNotEmpty()
    schoolId: number;

    @IsNumber()
    @IsInt()
    @IsNotEmpty()
    moduleId: number;
}
