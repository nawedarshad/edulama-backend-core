import { Body, Controller, Get, Put, UseGuards, ForbiddenException, Logger, Query, ParseIntPipe } from '@nestjs/common';
import { AttendanceConfigService } from './attendance-config.service';
import { UpdateAttendanceConfigDto } from './dto/update-config.dto';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { GetUser, type AuthUserPayload } from 'src/common/decorators/get-user.decorator';

@Controller('principal/attendance-config')
@UseGuards(PrincipalAuthGuard)
export class AttendanceConfigController {
    private readonly logger = new Logger(AttendanceConfigController.name);

    constructor(private readonly service: AttendanceConfigService) { }

    @Get()
    getConfig(@GetUser() user: AuthUserPayload, @Query('academicYearId', ParseIntPipe) academicYearId: number) {
        // Principal, School Admin, and Teacher may view config
        if (!['PRINCIPAL', 'SCHOOL_ADMIN', 'TEACHER'].includes(user.role as string)) {
            throw new ForbiddenException('You do not have permission to view attendance settings');
        }
        return this.service.getConfig(user.schoolId, academicYearId);
    }

    @Put()
    updateConfig(@GetUser() user: AuthUserPayload, @Body() dto: UpdateAttendanceConfigDto) {
        if (user.role !== 'PRINCIPAL') {
            throw new ForbiddenException('Only Principals can configure attendance settings');
        }
        return this.service.updateConfig(user.schoolId, dto);
    }
}
