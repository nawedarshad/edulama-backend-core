import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParentService {
    constructor(private readonly prisma: PrismaService) { }

    async getChildren(schoolId: number, parentUserId: number) {
        // Find links
        const links = await this.prisma.parentStudent.findMany({
            where: {
                parent: { userId: parentUserId },
                student: { schoolId }
            },
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        admissionNo: true,
                        rollNo: true,
                        photo: true,
                        class: { select: { id: true, name: true } },
                        section: { select: { id: true, name: true } },
                    }
                }
            }
        });

        // Flatten result
        return links.map(link => ({
            ...link.student,
            relation: link.relation
        }));
    }
}
