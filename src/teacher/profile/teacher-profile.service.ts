import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeacherProfileService {
    constructor(private readonly prisma: PrismaService) { }

    async findMyProfile(schoolId: number, userId: number) {
        const profile = await this.prisma.teacherProfile.findFirst({
            where: { userId, schoolId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        photo: true,
                        role: true,
                    }
                },
                personalInfo: true,
                qualifications: true,
                documents: true,
                skills: true,
                certifications: true,
                trainings: true,
                appraisals: {
                    orderBy: { evaluatedAt: 'desc' },
                    include: { academicYear: true } // Context for appraisal
                },
                additionalRoles: true,

                // Academic Assignments
                preferredSubjects: {
                    include: { subject: true }
                },
                ClassHeadTeacher: {
                    include: { class: true }
                },
                SectionTeacher: {
                    include: {
                        section: {
                            include: { class: true }
                        }
                    }
                },
                ClassSubject: { // Subjects they teach
                    include: {
                        class: true,
                        subject: true,
                        section: true
                    }
                },
                houseMasterOf: true,

                // School info (minimal)
                school: {
                    select: {
                        id: true,
                        name: true,
                        code: true
                    }
                }
            }
        });

        if (!profile) {
            throw new NotFoundException('Teacher profile not found');
        }

        return profile;
    }
}
