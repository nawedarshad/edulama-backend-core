import { PartialType } from '@nestjs/swagger';
import { ApplyStudentLeaveDto } from './apply-student-leave.dto';

export class UpdateStudentLeaveDto extends PartialType(ApplyStudentLeaveDto) { }
