import { IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { StudentNoticeQueryDto } from '../../../student/notice/dto/student-notice-query.dto';

export class ParentNoticeQueryDto extends StudentNoticeQueryDto {
    @IsNotEmpty()
    @IsInt()
    @Type(() => Number)
    studentId: number;
}
