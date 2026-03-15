import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudentProfileService {
    constructor(private readonly prisma: PrismaService) { }

    async getStudentProfile(studentUserId: number, schoolId: number) {
        const student = await this.prisma.studentProfile.findFirst({
            where: {
                userId: studentUserId,
                schoolId: schoolId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                        role: true,
                    }
                },
                school: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    }
                },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                parents: {
                    include: {
                        parent: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        photo: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!student) {
            throw new NotFoundException('Student profile not found');
        }

        return student;
    }

    async getChildProfileForParent(studentId: number, parentUserId: number) {
        // Verify parent-student link
        const link = await this.prisma.parentStudent.findFirst({
            where: {
                studentId: studentId,
                parent: { userId: parentUserId }
            }
        });

        if (!link) {
            throw new UnauthorizedException('You do not have permission to view this student profile');
        }

        const student = await this.prisma.studentProfile.findUnique({
            where: { id: studentId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                        role: true,
                    }
                },
                school: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    }
                },
                class: { select: { id: true, name: true } },
                section: { select: { id: true, name: true } },
                parents: {
                    include: {
                        parent: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        photo: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!student) {
            throw new NotFoundException('Student profile not found');
        }

        return student;
    }
}
