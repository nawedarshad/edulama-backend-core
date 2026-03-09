import { Module } from '@nestjs/common';
import { PublicSchoolController } from './public-school.controller';
import { PublicSchoolService } from './public-school.service';

@Module({
    controllers: [PublicSchoolController],
    providers: [PublicSchoolService]
})
export class PublicSchoolModule { }
