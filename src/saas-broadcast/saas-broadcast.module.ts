import { Module } from '@nestjs/common';
import { SaasBroadcastService } from './saas-broadcast.service';
import { SaasBroadcastController } from './saas-broadcast.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SaasBroadcastController],
  providers: [SaasBroadcastService],
  exports: [SaasBroadcastService],
})
export class SaasBroadcastModule {}
