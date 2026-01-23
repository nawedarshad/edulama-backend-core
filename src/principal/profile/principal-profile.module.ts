import { Module } from '@nestjs/common';
import { PrincipalProfileController } from './principal-profile.controller';
import { PrincipalProfileService } from './principal-profile.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [HttpModule, ConfigModule],
    controllers: [PrincipalProfileController],
    providers: [PrincipalProfileService],
    exports: [PrincipalProfileService]
})
export class PrincipalProfileModule { }
