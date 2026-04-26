import { PartialType } from '@nestjs/swagger';
import { CreateTimetableEntryDto } from './create-timetable-entry.dto';

export class UpdateTimetableEntryDto extends PartialType(CreateTimetableEntryDto) {}
