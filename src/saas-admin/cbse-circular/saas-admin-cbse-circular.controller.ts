import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SaasAdminCbseCircularService } from './saas-admin-cbse-circular.service';
import { CreateCbseCircularDto } from './dto/create-cbse-circular.dto';
import { UpdateCbseCircularDto } from './dto/update-cbse-circular.dto';
import { CbseCircularQueryDto } from './dto/cbse-circular-query.dto';
import { AdminAuthGuard } from 'src/common/guards/admin.guard';

@Controller('saas-admin/cbse-circulars')
@UseGuards(AdminAuthGuard)
export class SaasAdminCbseCircularController {
    constructor(private readonly service: SaasAdminCbseCircularService) { }

    @Post()
    create(@Body() createDto: CreateCbseCircularDto) {
        return this.service.create(createDto);
    }

    @Get()
    findAll(@Query() query: CbseCircularQueryDto) {
        return this.service.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateCbseCircularDto) {
        return this.service.update(id, updateDto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }

    @Get(':id/analytics')
    getAnalytics(@Param('id', ParseIntPipe) id: number) {
        return this.service.getAnalytics(id);
    }
}
