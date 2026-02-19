import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';

@Injectable()
export class InquiryService {
    constructor(private prisma: PrismaService) { }

    async create(schoolId: number, dto: CreateInquiryDto) {
        return this.prisma.inquiry.create({
            data: {
                ...dto,
            },
        });
    }

    async findAll(schoolId: number) {
        return this.prisma.inquiry.findMany({
            where: { schoolId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async updateStatus(id: number, schoolId: number, status: string) {
        return this.prisma.inquiry.updateMany({
            where: { id, schoolId },
            data: { status },
        });
    }
}
