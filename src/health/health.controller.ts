import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOperation({ summary: 'Check if the server is running' })
    check() {
        return {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: Date.now(),
            message: 'Server is running smoothly',
        };
    }
}
