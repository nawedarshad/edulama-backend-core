import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeacherSectionService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, classId: number) {
        return this.prisma.section.findMany({
            where: {
                schoolId,
                classId, // Filter by Class
            },
            select: {
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
    }
}
