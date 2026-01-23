import { PartialType } from '@nestjs/mapped-types';
import { CreateClassDiaryDto } from './create-class-diary.dto';

export class UpdateClassDiaryDto extends PartialType(CreateClassDiaryDto) { }
