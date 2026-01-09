import { Module } from '@nestjs/common';
import { HouseService } from './house.service';
import { HouseController } from './house.controller';

import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [HttpModule],
    controllers: [HouseController],
    providers: [HouseService],
})
export class HouseModule { }
