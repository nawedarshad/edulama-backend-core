import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeacherClassService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(schoolId: number, userId: number) {
        const classes = await this.prisma.class.findMany({
            where: { schoolId },
            select: {
                id: true,
                name: true,
                sections: {
                    select: {
                        id: true,
                        name: true,
                        classTeacher: {
                            select: {
                                teacher: {
                                    select: { userId: true }
                                }
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { name: 'asc' },
        });

        // Flatten to TeacherClass structure
        const result: {
            class: { id: number; name: string };
            section: { id: number; name: string };
            isClassTeacher: boolean;
        }[] = [];
        for (const cls of classes) {
            for (const sec of cls.sections) {
                result.push({
                    class: { id: cls.id, name: cls.name },
                    section: { id: sec.id, name: sec.name },
                    isClassTeacher: sec.classTeacher?.teacher?.userId === userId
                });
            }
        }
        return result;
    }
}
