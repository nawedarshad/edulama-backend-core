import { PrismaClient, GrievanceStatus, GrievancePriority, GrievanceCategory, CbseCircularType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const schoolId = 7;
    const academicYearId = 6;
    const teacherUserId = 59; // Nandini Gupta
    const studentUserId = 10; // Nawed Arshad
    
    console.log('Seeding CBSE Circulars...');
    
    // CBSE Circulars (Global)
    const circular1 = await prisma.cbseCircular.create({
        data: {
            title: 'Secondary School Curriculum 2026-27',
            content: '<p>The Secondary School Curriculum for the academic session 2026-27 has been released.</p>',
            type: CbseCircularType.ACADEMIC,
            date: new Date('2026-03-15'),
            attachments: {
                create: {
                    fileName: 'Curriculum_2026_27.pdf',
                    fileUrl: 'https://example.com/cbse/curriculum-2026.pdf',
                    fileType: 'PDF'
                }
            }
        }
    });

    const circular2 = await prisma.cbseCircular.create({
        data: {
            title: 'Board Examination Schedule Class X & XII',
            content: '<p>The schedule for the upcoming board examinations has been finalized.</p>',
            type: CbseCircularType.EXAM,
            date: new Date('2026-04-01'),
            attachments: {
                create: {
                    fileName: 'Exam_Schedule_2026.pdf',
                    fileUrl: 'https://example.com/cbse/exam-schedule-2026.pdf',
                    fileType: 'PDF'
                }
            }
        }
    });

    console.log('Seeding Grievances...');

    // Student Grievance
    const grievance1 = await prisma.grievance.create({
        data: {
            schoolId,
            academicYearId,
            raisedById: studentUserId,
            title: 'Broken fan in Room 102',
            description: 'The ceiling fan in our classroom (Room 102) has been making a loud noise and rotating very slowly for the past 3 days.',
            category: GrievanceCategory.INFRASTRUCTURE,
            priority: GrievancePriority.MEDIUM,
            status: GrievanceStatus.OPEN,
        }
    });

    // Anonymous Grievance
    const grievance2 = await prisma.grievance.create({
        data: {
            schoolId,
            academicYearId,
            raisedById: studentUserId, // Recorded but hidden via flag
            title: 'Concerns about Canteen Food Quality',
            description: 'The quality of food served in the canteen has decreased significantly. It is often cold and unhygienic.',
            category: GrievanceCategory.OTHER,
            priority: GrievancePriority.HIGH,
            isAnonymous: true,
            status: GrievanceStatus.IN_PROGRESS,
            assignedToId: teacherUserId,
        }
    });

    // Resolved Grievance
    const grievance3 = await prisma.grievance.create({
        data: {
            schoolId,
            academicYearId,
            raisedById: teacherUserId,
            title: 'Request for New Science Lab Equipment',
            description: 'The chemistry lab needs new test tubes and beakers as many were damaged during the last practical session.',
            category: GrievanceCategory.ACADEMIC,
            priority: GrievancePriority.URGENT,
            status: GrievanceStatus.RESOLVED,
            resolvedById: 1, // System admin
            resolvedAt: new Date(),
            resolutionNote: 'Order placed for 100 sets of lab equipment.'
        }
    });

    console.log('Seeding Grievance Comments...');

    await prisma.grievanceComment.createMany({
        data: [
            {
                grievanceId: grievance2.id,
                userId: teacherUserId,
                message: 'We have received your concern and the canteen committee will conduct an inspection tomorrow.'
            },
            {
                grievanceId: grievance2.id,
                userId: 1,
                message: 'Management is reviewing the canteen contract.'
            }
        ]
    });

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
