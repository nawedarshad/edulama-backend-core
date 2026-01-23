import { PartialType } from '@nestjs/mapped-types';
import { ApplyLeaveDto } from './apply-leave.dto';

export class UpdateLeaveDto extends PartialType(ApplyLeaveDto) { }
