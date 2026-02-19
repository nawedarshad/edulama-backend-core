
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebPageService {
    constructor(private prisma: PrismaService) { }

    async create(schoolId: number, data: any) {
        return this.prisma.webPage.create({
            data: {
                ...data,
                schoolId,
            },
        });
    }

    async findAll(schoolId: number) {
        return this.prisma.webPage.findMany({
            where: { schoolId },
            orderBy: { updatedAt: 'desc' },
        });
    }

    async findOne(schoolId: number, id: number) {
        const page = await this.prisma.webPage.findFirst({
            where: { id, schoolId },
        });
        if (!page) throw new NotFoundException('Page not found');
        return page;
    }

    async findBySlug(subdomain: string, slug: string) {
        const school = await this.prisma.school.findUnique({
            where: { subdomain },
            include: {
                webPages: {
                    where: { slug, isPublished: true },
                },
            },
        });

        if (!school || !school.webPages.length) {
            return null;
        }

        return school.webPages[0];
    }

    async update(schoolId: number, id: number, data: any) {
        // Check existence
        await this.findOne(schoolId, id);
        return this.prisma.webPage.update({
            where: { id },
            data,
        });
    }

    async remove(schoolId: number, id: number) {
        // Check existence
        await this.findOne(schoolId, id);
        return this.prisma.webPage.delete({
            where: { id },
        });
    }
}
