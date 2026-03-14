import { Body, Controller, Get, Put, UseGuards, Request, ForbiddenException, Logger, Query, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { AttendanceConfigService } from './attendance-config.service';
import { UpdateAttendanceConfigDto } from './dto/update-config.dto';
import { PrincipalAuthGuard } from 'src/common/guards/principal.guard';
import { AuthUserPayload } from 'src/common/decorators/get-user.decorator';

@Controller('principal/attendance-config')
@UseGuards(PrincipalAuthGuard)
export class AttendanceConfigController {
    private readonly logger = new Logger(AttendanceConfigController.name);

    constructor(private readonly service: AttendanceConfigService) { }

    private validatePrincipal(user: AuthUserPayload) {
        // Logic: Only PRINCIPAL can configure this.
        if (user.role !== 'PRINCIPAL') {
            this.logger.warn(`User ${user.id} provided but role is ${user.role}, not PRINCIPAL`);
            throw new ForbiddenException('Only Principals can configure attendance settings');
        }
    }

    @Get()
    async getConfig(@Request() req, @Query('academicYearId', ParseIntPipe) academicYearId: number) {
        this.logger.log(`GET /attendance-config called`);
        const user = req.user as AuthUserPayload;

        if (!user) {
            this.logger.error('No user found in request');
        } else {
            this.logger.log(`User: ${JSON.stringify(user)}`);
        }

        if (!academicYearId) {
            throw new BadRequestException('academicYearId query parameter is required');
        }

        // Allow Principal, School Admin, and Teacher to VIEW config
        if (!['PRINCIPAL', 'SCHOOL_ADMIN', 'TEACHER'].includes(user.role as string)) {
            this.logger.warn(`User ${user.id} provided but role is ${user.role}, access denied`);
            throw new ForbiddenException('You do not have permission to view attendance settings');
        }

        this.logger.log(`Fetching config for schoolId: ${user.schoolId} and Academic Year: ${academicYearId}`);
        return this.service.getConfig(user.schoolId, academicYearId);
    }

    @Put()
    async updateConfig(@Request() req, @Body() dto: UpdateAttendanceConfigDto) {
        this.logger.log(`PUT /attendance-config called with body: ${JSON.stringify(dto)}`);
        const user = req.user as AuthUserPayload;

        if (!user) {
            this.logger.error('No user found in request');
        } else {
            this.logger.log(`User: ${JSON.stringify(user)}`);
        }

        this.validatePrincipal(user);

        return this.service.updateConfig(user.schoolId, dto);
    }
}
